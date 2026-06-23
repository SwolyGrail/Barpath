/* Barpath — data.js
   Static content: goals, the 12 programs, exercise pools, gamification tables.
   Pure data + tiny builder helpers. No DOM, no state. */
(function (global) {
  "use strict";

  /* ---------- slot builders ----------
     t = slot type. Working sets/reps are baselines for an INTERMEDIATE lifter
     and get scaled by level + periodization week in app.js. */
  function W() {
    return { t: "warmup", name: "Warm-up", muscle: "cardio",
      prescription: "5–8 min easy cardio, then 2–3 light ramp-up sets" };
  }
  function M(name, muscle, pr, reps, sets, pct) {
    return { t: "main", name: name, muscle: muscle, pr: pr, reps: reps, sets: sets, pct: pct || null };
  }
  function A(reps, sets) {
    var opts = [];
    for (var i = 2; i < arguments.length; i++) {
      var parts = arguments[i].split("|");
      opts.push({ name: parts[0], muscle: parts[1] });
    }
    return { t: "pool", reps: reps, sets: sets, options: opts };
  }
  function C(name, muscle) {
    var pres = [];
    for (var i = 2; i < arguments.length; i++) pres.push(arguments[i]);
    return { t: "cardio", name: name, muscle: muscle, options: pres };
  }
  function day(name, focus, slots) { return { name: name, focus: focus, slots: slots }; }

  /* ---------- goals ---------- */
  var GOALS = {
    powerbuilding: {
      id: "powerbuilding", name: "Powerbuilding", color: "#2f7bff", color2: "#19c3ff",
      blurb: "Heavy compounds for strength, accessories for size.",
      tagline: "Strength + size, the best of both."
    },
    hypertrophy: {
      id: "hypertrophy", name: "Hypertrophy", color: "#a855f7", color2: "#d96bff",
      blurb: "Maximize muscle with higher volume and moderate reps.",
      tagline: "Build muscle with smart volume."
    },
    powerlifting: {
      id: "powerlifting", name: "Powerlifting", color: "#ff4d57", color2: "#ff8a5b",
      blurb: "A bigger squat, bench and deadlift. Low reps, real intensity.",
      tagline: "Chase the total. Squat, bench, deadlift."
    },
    endurance: {
      id: "endurance", name: "Cardio / Endurance", color: "#14b8a6", color2: "#22d3ee",
      blurb: "Aerobic capacity and stamina with intervals, tempo and Zone-2.",
      tagline: "Go longer. Recover faster."
    }
  };
  var GOAL_ORDER = ["powerbuilding", "hypertrophy", "powerlifting", "endurance"];

  /* ---------- splits per goal × days ---------- */
  var PROGRAMS = {};

  /* ===== POWERBUILDING ===== */
  PROGRAMS.powerbuilding = {
    splitName: { 3: "Upper / Lower / Full", 4: "Upper Power / Lower Power / Upper Hyper. / Lower Hyper.", 5: "Push / Pull / Legs / Upper / Lower" },
    3: [
      day("Upper", "Chest, back, shoulders & arms", [
        W(),
        M("Bench Press", "chest", "bench", "4–6", 4),
        M("Barbell Row", "back", "row", "5–8", 3),
        A("8–12", 3, "Seated DB Shoulder Press|shoulders", "Standing Overhead Press|shoulders", "Machine Shoulder Press|shoulders"),
        A("8–12", 3, "Barbell Row|back", "Chest-Supported Row|back", "Seated Cable Row|back"),
        A("10–15", 3, "EZ-Bar Curl|biceps", "Incline DB Curl|biceps", "Hammer Curl|biceps"),
        A("10–15", 3, "Triceps Rope Pushdown|triceps", "Overhead Cable Extension|triceps", "Close-Grip Bench|triceps")
      ]),
      day("Lower", "Quads, hamstrings, glutes & calves", [
        W(),
        M("Back Squat", "quads", "squat", "4–6", 4),
        A("6–10", 3, "Romanian Deadlift|hamstrings", "Trap-Bar Deadlift|hamstrings", "Good Morning|hamstrings"),
        A("10–12", 3, "Leg Press|quads", "Walking Lunge|quads", "Hack Squat|quads"),
        A("10–15", 3, "Lying Leg Curl|hamstrings", "Seated Leg Curl|hamstrings", "Nordic Curl|hamstrings"),
        A("12–20", 3, "Standing Calf Raise|calves", "Seated Calf Raise|calves", "Leg-Press Calf Raise|calves"),
        A("10–15", 3, "Hanging Leg Raise|core", "Cable Crunch|core", "Ab Wheel|core")
      ]),
      day("Full Body", "Total-body strength", [
        W(),
        M("Deadlift", "hamstrings", "deadlift", "3–5", 3),
        M("Overhead Press", "shoulders", "ohp", "5–8", 3),
        A("8–12", 3, "Front Squat|quads", "Goblet Squat|quads", "Bulgarian Split Squat|quads"),
        A("8–12", 3, "Incline Bench Press|chest", "Weighted Dip|chest", "DB Bench Press|chest"),
        A("10–12", 3, "Lat Pulldown|back", "Pull-Up|back", "Pendlay Row|back"),
        A("12–20", 3, "Farmer Carry|core", "Ab Wheel|core", "Side Plank|core")
      ])
    ],
    4: [
      day("Upper Power", "Heavy pressing & pulling", [
        W(),
        M("Bench Press", "chest", "bench", "3–5", 4),
        M("Barbell Row", "back", "row", "4–6", 4),
        A("6–8", 3, "Standing Overhead Press|shoulders", "Push Press|shoulders", "Seated Barbell Press|shoulders"),
        A("6–10", 3, "Pendlay Row|back", "T-Bar Row|back", "Barbell Row|back"),
        A("8–12", 3, "Weighted Dip|triceps", "Close-Grip Bench|triceps", "Skullcrusher|triceps")
      ]),
      day("Lower Power", "Heavy squat & hinge", [
        W(),
        M("Back Squat", "quads", "squat", "3–5", 4),
        M("Deadlift", "hamstrings", "deadlift", "3–5", 3),
        A("8–12", 3, "Leg Press|quads", "Hack Squat|quads", "Bulgarian Split Squat|quads"),
        A("10–15", 3, "Lying Leg Curl|hamstrings", "Seated Leg Curl|hamstrings", "Nordic Curl|hamstrings"),
        A("12–20", 3, "Standing Calf Raise|calves", "Seated Calf Raise|calves", "Leg-Press Calf Raise|calves")
      ]),
      day("Upper Hypertrophy", "Pump-focused upper volume", [
        W(),
        A("8–12", 3, "Incline DB Press|chest", "Machine Chest Press|chest", "Cable Fly|chest"),
        A("10–12", 3, "Lat Pulldown|back", "Chest-Supported Row|back", "Seated Cable Row|back"),
        A("12–15", 3, "Lateral Raise|shoulders", "Cable Lateral Raise|shoulders", "DB Lateral Raise|shoulders"),
        A("10–15", 3, "Incline DB Curl|biceps", "Cable Curl|biceps", "Preacher Curl|biceps"),
        A("10–15", 3, "Triceps Rope Pushdown|triceps", "Overhead Cable Extension|triceps", "Cross-Body Extension|triceps"),
        A("12–20", 3, "Face Pull|shoulders", "Reverse Pec-Deck|shoulders", "Band Pull-Apart|shoulders")
      ]),
      day("Lower Hypertrophy", "Pump-focused lower volume", [
        W(),
        A("10–12", 3, "Front Squat|quads", "Hack Squat|quads", "Leg Press|quads"),
        A("10–12", 3, "Romanian Deadlift|hamstrings", "Good Morning|hamstrings", "Hip Thrust|glutes"),
        A("12–15", 3, "Leg Extension|quads", "Walking Lunge|quads", "Sissy Squat|quads"),
        A("12–15", 3, "Seated Leg Curl|hamstrings", "Lying Leg Curl|hamstrings", "Nordic Curl|hamstrings"),
        A("15–20", 3, "Seated Calf Raise|calves", "Standing Calf Raise|calves", "Leg-Press Calf Raise|calves"),
        A("10–15", 3, "Hanging Leg Raise|core", "Cable Crunch|core", "Ab Wheel|core")
      ])
    ],
    5: [
      day("Push", "Chest, shoulders & triceps", [
        W(),
        M("Bench Press", "chest", "bench", "4–6", 4),
        M("Overhead Press", "shoulders", "ohp", "6–8", 3),
        A("8–12", 3, "Incline DB Press|chest", "Weighted Dip|chest", "Machine Chest Press|chest"),
        A("12–15", 3, "Lateral Raise|shoulders", "Cable Lateral Raise|shoulders", "DB Lateral Raise|shoulders"),
        A("10–15", 3, "Triceps Rope Pushdown|triceps", "Skullcrusher|triceps", "Overhead Cable Extension|triceps")
      ]),
      day("Pull", "Back & biceps", [
        W(),
        M("Barbell Row", "back", "row", "5–8", 4),
        A("6–10", 3, "Barbell Row|back", "Pendlay Row|back", "T-Bar Row|back"),
        A("10–12", 3, "Lat Pulldown|back", "Chest-Supported Row|back", "Seated Cable Row|back"),
        A("12–20", 3, "Face Pull|shoulders", "Reverse Pec-Deck|shoulders", "Band Pull-Apart|shoulders"),
        A("10–15", 3, "EZ-Bar Curl|biceps", "Incline DB Curl|biceps", "Hammer Curl|biceps")
      ]),
      day("Legs", "Quads, hamstrings & calves", [
        W(),
        M("Back Squat", "quads", "squat", "4–6", 4),
        M("Deadlift", "hamstrings", "deadlift", "3–5", 3),
        A("10–12", 3, "Leg Press|quads", "Hack Squat|quads", "Walking Lunge|quads"),
        A("12–15", 3, "Lying Leg Curl|hamstrings", "Seated Leg Curl|hamstrings", "Nordic Curl|hamstrings"),
        A("12–20", 3, "Standing Calf Raise|calves", "Seated Calf Raise|calves", "Leg-Press Calf Raise|calves")
      ]),
      day("Upper", "Upper-body strength & size", [
        W(),
        A("6–8", 4, "Incline Bench Press|chest", "Close-Grip Bench|chest", "Weighted Dip|chest"),
        A("8–10", 3, "Pendlay Row|back", "T-Bar Row|back", "Chest-Supported Row|back"),
        A("10–12", 3, "Seated DB Shoulder Press|shoulders", "Machine Shoulder Press|shoulders", "Arnold Press|shoulders"),
        A("12–15", 3, "Cable Curl|biceps", "Preacher Curl|biceps", "Hammer Curl|biceps"),
        A("12–15", 3, "Overhead Cable Extension|triceps", "Cross-Body Extension|triceps", "Triceps Rope Pushdown|triceps")
      ]),
      day("Lower", "Lower-body strength & size", [
        W(),
        A("6–8", 4, "Front Squat|quads", "Hack Squat|quads", "Pause Back Squat|quads"),
        A("8–10", 3, "Romanian Deadlift|hamstrings", "Trap-Bar Deadlift|hamstrings", "Good Morning|hamstrings"),
        A("12–15", 3, "Leg Extension|quads", "Bulgarian Split Squat|quads", "Sissy Squat|quads"),
        A("12–15", 3, "Hip Thrust|glutes", "Cable Pull-Through|glutes", "Glute Bridge|glutes"),
        A("15–20", 3, "Seated Calf Raise|calves", "Standing Calf Raise|calves", "Leg-Press Calf Raise|calves")
      ])
    ]
  };

  /* ===== HYPERTROPHY ===== */
  PROGRAMS.hypertrophy = {
    splitName: { 3: "Push / Pull / Legs", 4: "Upper / Lower / Upper / Lower", 5: "Push / Pull / Legs / Upper / Lower" },
    3: [
      day("Push", "Chest, shoulders & triceps", [
        W(),
        M("Bench Press", "chest", "bench", "8–10", 4),
        A("10–12", 3, "Incline DB Press|chest", "Machine Chest Press|chest", "Weighted Dip|chest"),
        A("12–15", 3, "Cable Fly|chest", "Pec-Deck|chest", "DB Fly|chest"),
        A("12–15", 4, "Lateral Raise|shoulders", "Cable Lateral Raise|shoulders", "DB Lateral Raise|shoulders"),
        A("12–15", 3, "Triceps Rope Pushdown|triceps", "Overhead Cable Extension|triceps", "Skullcrusher|triceps")
      ]),
      day("Pull", "Back & biceps", [
        W(),
        M("Barbell Row", "back", "row", "8–10", 4),
        A("10–12", 3, "Chest-Supported Row|back", "Seated Cable Row|back", "Barbell Row|back"),
        A("12–15", 3, "Lat Pulldown|back", "Straight-Arm Pulldown|back", "Single-Arm Pulldown|back"),
        A("15–20", 3, "Face Pull|shoulders", "Reverse Pec-Deck|shoulders", "Band Pull-Apart|shoulders"),
        A("12–15", 4, "Incline DB Curl|biceps", "Cable Curl|biceps", "Preacher Curl|biceps")
      ]),
      day("Legs", "Quads, hamstrings, glutes & calves", [
        W(),
        M("Back Squat", "quads", "squat", "8–10", 4),
        A("10–12", 3, "Romanian Deadlift|hamstrings", "Leg Press|quads", "Hack Squat|quads"),
        A("12–15", 3, "Leg Extension|quads", "Walking Lunge|quads", "Bulgarian Split Squat|quads"),
        A("12–15", 3, "Seated Leg Curl|hamstrings", "Lying Leg Curl|hamstrings", "Nordic Curl|hamstrings"),
        A("12–15", 3, "Hip Thrust|glutes", "Cable Pull-Through|glutes", "Glute Bridge|glutes"),
        A("15–20", 4, "Seated Calf Raise|calves", "Standing Calf Raise|calves", "Leg-Press Calf Raise|calves")
      ])
    ],
    4: [
      day("Upper A", "Chest & back focus", [
        W(),
        M("Bench Press", "chest", "bench", "8–10", 4),
        A("10–12", 3, "Chest-Supported Row|back", "Seated Cable Row|back", "Barbell Row|back"),
        A("12–15", 3, "Incline DB Press|chest", "Cable Fly|chest", "Machine Chest Press|chest"),
        A("12–15", 3, "Lat Pulldown|back", "Straight-Arm Pulldown|back", "Single-Arm Pulldown|back"),
        A("12–15", 3, "Lateral Raise|shoulders", "Cable Lateral Raise|shoulders", "DB Lateral Raise|shoulders")
      ]),
      day("Lower A", "Quad focus", [
        W(),
        M("Back Squat", "quads", "squat", "8–10", 4),
        A("10–12", 3, "Leg Press|quads", "Hack Squat|quads", "Front Squat|quads"),
        A("12–15", 3, "Leg Extension|quads", "Walking Lunge|quads", "Sissy Squat|quads"),
        A("12–15", 3, "Seated Leg Curl|hamstrings", "Lying Leg Curl|hamstrings", "Nordic Curl|hamstrings"),
        A("15–20", 4, "Standing Calf Raise|calves", "Seated Calf Raise|calves", "Leg-Press Calf Raise|calves")
      ]),
      day("Upper B", "Shoulders & arms focus", [
        W(),
        M("Overhead Press", "shoulders", "ohp", "8–10", 4),
        A("10–12", 3, "Weighted Pull-Ups|back", "Lat Pulldown|back", "Pull-Up|back"),
        A("12–15", 3, "Incline DB Press|chest", "Machine Chest Press|chest", "Weighted Dip|chest"),
        A("12–15", 4, "Incline DB Curl|biceps", "Cable Curl|biceps", "Hammer Curl|biceps"),
        A("12–15", 4, "Overhead Cable Extension|triceps", "Triceps Rope Pushdown|triceps", "Skullcrusher|triceps")
      ]),
      day("Lower B", "Hamstring & glute focus", [
        W(),
        M("Deadlift", "hamstrings", "deadlift", "6–8", 3),
        A("10–12", 3, "Romanian Deadlift|hamstrings", "Good Morning|hamstrings", "Hip Thrust|glutes"),
        A("12–15", 3, "Bulgarian Split Squat|quads", "Walking Lunge|quads", "Leg Press|quads"),
        A("12–15", 3, "Seated Leg Curl|hamstrings", "Lying Leg Curl|hamstrings", "Nordic Curl|hamstrings"),
        A("12–15", 3, "Cable Crunch|core", "Hanging Leg Raise|core", "Ab Wheel|core")
      ])
    ],
    5: [
      day("Push", "Chest, shoulders & triceps", [
        W(),
        M("Bench Press", "chest", "bench", "8–10", 4),
        A("10–12", 3, "Incline DB Press|chest", "Machine Chest Press|chest", "Weighted Dip|chest"),
        A("12–15", 3, "Cable Fly|chest", "Pec-Deck|chest", "DB Fly|chest"),
        A("12–15", 4, "Lateral Raise|shoulders", "Cable Lateral Raise|shoulders", "DB Lateral Raise|shoulders"),
        A("12–15", 3, "Triceps Rope Pushdown|triceps", "Overhead Cable Extension|triceps", "Cross-Body Extension|triceps")
      ]),
      day("Pull", "Back & biceps", [
        W(),
        M("Barbell Row", "back", "row", "8–10", 4),
        A("10–12", 3, "Chest-Supported Row|back", "Seated Cable Row|back", "Barbell Row|back"),
        A("12–15", 3, "Lat Pulldown|back", "Straight-Arm Pulldown|back", "Single-Arm Pulldown|back"),
        A("15–20", 3, "Face Pull|shoulders", "Reverse Pec-Deck|shoulders", "Band Pull-Apart|shoulders"),
        A("12–15", 4, "Incline DB Curl|biceps", "Preacher Curl|biceps", "Cable Curl|biceps")
      ]),
      day("Legs", "Quads, hamstrings, glutes & calves", [
        W(),
        M("Back Squat", "quads", "squat", "8–10", 4),
        A("10–12", 3, "Romanian Deadlift|hamstrings", "Leg Press|quads", "Hack Squat|quads"),
        A("12–15", 3, "Leg Extension|quads", "Walking Lunge|quads", "Bulgarian Split Squat|quads"),
        A("12–15", 3, "Seated Leg Curl|hamstrings", "Lying Leg Curl|hamstrings", "Nordic Curl|hamstrings"),
        A("15–20", 4, "Seated Calf Raise|calves", "Standing Calf Raise|calves", "Leg-Press Calf Raise|calves")
      ]),
      day("Upper", "Upper-body volume", [
        W(),
        A("8–12", 4, "Incline Bench Press|chest", "Machine Chest Press|chest", "Weighted Dip|chest"),
        A("10–12", 3, "Chest-Supported Row|back", "Seated Cable Row|back", "Lat Pulldown|back"),
        A("12–15", 3, "Arnold Press|shoulders", "Seated DB Shoulder Press|shoulders", "Machine Shoulder Press|shoulders"),
        A("12–15", 3, "Cable Curl|biceps", "Hammer Curl|biceps", "Preacher Curl|biceps"),
        A("12–15", 3, "Overhead Cable Extension|triceps", "Triceps Rope Pushdown|triceps", "Skullcrusher|triceps")
      ]),
      day("Lower", "Lower-body volume", [
        W(),
        A("8–12", 4, "Front Squat|quads", "Hack Squat|quads", "Leg Press|quads"),
        A("10–12", 3, "Romanian Deadlift|hamstrings", "Good Morning|hamstrings", "Hip Thrust|glutes"),
        A("12–15", 3, "Leg Extension|quads", "Walking Lunge|quads", "Sissy Squat|quads"),
        A("12–15", 3, "Seated Leg Curl|hamstrings", "Lying Leg Curl|hamstrings", "Nordic Curl|hamstrings"),
        A("15–20", 3, "Seated Calf Raise|calves", "Standing Calf Raise|calves", "Leg-Press Calf Raise|calves")
      ])
    ]
  };

  /* ===== POWERLIFTING ===== */
  PROGRAMS.powerlifting = {
    splitName: { 3: "Squat / Bench / Deadlift", 4: "Squat / Bench / Deadlift / Press & Accessories", 5: "Squat / Bench / Deadlift / Volume / Upper" },
    3: [
      day("Squat", "Build a bigger squat", [
        W(),
        M("Back Squat", "quads", "squat", "3–5", 5, "75–85%"),
        A("5–8", 3, "Pause Back Squat|quads", "Front Squat|quads", "Tempo Squat|quads"),
        A("8–10", 3, "Romanian Deadlift|hamstrings", "Good Morning|hamstrings", "Leg Press|quads"),
        A("10–15", 3, "Lying Leg Curl|hamstrings", "Seated Leg Curl|hamstrings", "Nordic Curl|hamstrings"),
        A("10–15", 3, "Hanging Leg Raise|core", "Cable Crunch|core", "Ab Wheel|core")
      ]),
      day("Bench", "Build a bigger bench", [
        W(),
        M("Bench Press", "chest", "bench", "3–5", 5, "75–85%"),
        A("5–8", 3, "Close-Grip Bench|triceps", "Pause Bench|chest", "Spoto Press|chest"),
        A("8–10", 3, "Incline Bench Press|chest", "DB Bench Press|chest", "Weighted Dip|chest"),
        A("8–12", 3, "Pendlay Row|back", "Chest-Supported Row|back", "Barbell Row|back"),
        A("12–15", 3, "Triceps Rope Pushdown|triceps", "Skullcrusher|triceps", "Overhead Cable Extension|triceps")
      ]),
      day("Deadlift", "Build a bigger deadlift", [
        W(),
        M("Deadlift", "hamstrings", "deadlift", "2–4", 5, "75–85%"),
        A("3–5", 3, "Deficit Deadlift|hamstrings", "Pause Deadlift|hamstrings", "Block Pull|hamstrings"),
        A("6–8", 3, "Front Squat|quads", "Hack Squat|quads", "Leg Press|quads"),
        A("8–12", 3, "Weighted Pull-Ups|back", "Lat Pulldown|back", "Pull-Up|back"),
        A("10–15", 3, "Back Extension|hamstrings", "Glute-Ham Raise|hamstrings", "Reverse Hyper|glutes")
      ])
    ],
    4: [
      day("Squat", "Heavy squat day", [
        W(),
        M("Back Squat", "quads", "squat", "3–5", 5, "78–88%"),
        A("5–8", 3, "Pause Back Squat|quads", "Front Squat|quads", "Tempo Squat|quads"),
        A("8–10", 3, "Romanian Deadlift|hamstrings", "Good Morning|hamstrings", "Leg Press|quads"),
        A("12–15", 3, "Lying Leg Curl|hamstrings", "Seated Leg Curl|hamstrings", "Nordic Curl|hamstrings")
      ]),
      day("Bench", "Heavy bench day", [
        W(),
        M("Bench Press", "chest", "bench", "3–5", 5, "78–88%"),
        A("5–8", 3, "Close-Grip Bench|triceps", "Pause Bench|chest", "Spoto Press|chest"),
        A("8–10", 3, "Incline Bench Press|chest", "DB Bench Press|chest", "Weighted Dip|chest"),
        A("10–12", 3, "Pendlay Row|back", "Chest-Supported Row|back", "T-Bar Row|back")
      ]),
      day("Deadlift", "Heavy pull day", [
        W(),
        M("Deadlift", "hamstrings", "deadlift", "2–4", 5, "78–88%"),
        A("3–5", 3, "Deficit Deadlift|hamstrings", "Pause Deadlift|hamstrings", "Block Pull|hamstrings"),
        A("6–8", 3, "Front Squat|quads", "Hack Squat|quads", "Bulgarian Split Squat|quads"),
        A("10–15", 3, "Back Extension|hamstrings", "Glute-Ham Raise|hamstrings", "Reverse Hyper|glutes")
      ]),
      day("Press & Accessories", "Overhead & weak-point work", [
        W(),
        M("Overhead Press", "shoulders", "ohp", "4–6", 4),
        A("8–10", 3, "Weighted Pull-Ups|back", "Lat Pulldown|back", "Pull-Up|back"),
        A("10–12", 3, "Lateral Raise|shoulders", "Cable Lateral Raise|shoulders", "Face Pull|shoulders"),
        A("10–15", 3, "EZ-Bar Curl|biceps", "Hammer Curl|biceps", "Cable Curl|biceps"),
        A("10–15", 3, "Triceps Rope Pushdown|triceps", "Overhead Cable Extension|triceps", "Skullcrusher|triceps")
      ])
    ],
    5: [
      day("Heavy Squat", "Top-end squat strength", [
        W(),
        M("Back Squat", "quads", "squat", "1–3", 5, "82–90%"),
        A("4–6", 3, "Pause Back Squat|quads", "Front Squat|quads", "Tempo Squat|quads"),
        A("8–10", 3, "Romanian Deadlift|hamstrings", "Good Morning|hamstrings", "Leg Press|quads"),
        A("12–15", 3, "Lying Leg Curl|hamstrings", "Seated Leg Curl|hamstrings", "Nordic Curl|hamstrings")
      ]),
      day("Heavy Bench", "Top-end bench strength", [
        W(),
        M("Bench Press", "chest", "bench", "1–3", 5, "82–90%"),
        A("4–6", 3, "Close-Grip Bench|triceps", "Pause Bench|chest", "Spoto Press|chest"),
        A("8–10", 3, "Incline Bench Press|chest", "DB Bench Press|chest", "Weighted Dip|chest"),
        A("10–12", 3, "Pendlay Row|back", "Chest-Supported Row|back", "T-Bar Row|back")
      ]),
      day("Heavy Deadlift", "Top-end pulling strength", [
        W(),
        M("Deadlift", "hamstrings", "deadlift", "1–3", 5, "82–90%"),
        A("3–5", 3, "Deficit Deadlift|hamstrings", "Pause Deadlift|hamstrings", "Block Pull|hamstrings"),
        A("6–8", 3, "Front Squat|quads", "Hack Squat|quads", "Bulgarian Split Squat|quads"),
        A("10–15", 3, "Back Extension|hamstrings", "Glute-Ham Raise|hamstrings", "Reverse Hyper|glutes")
      ]),
      day("Volume", "Sub-max competition lifts", [
        W(),
        M("Back Squat", "quads", "squat", "5–8", 4, "65–72%"),
        M("Bench Press", "chest", "bench", "5–8", 4, "65–72%"),
        A("8–10", 3, "Romanian Deadlift|hamstrings", "Leg Press|quads", "Hack Squat|quads"),
        A("12–15", 3, "Triceps Rope Pushdown|triceps", "Skullcrusher|triceps", "Overhead Cable Extension|triceps")
      ]),
      day("Upper", "Overhead & back hypertrophy", [
        W(),
        M("Overhead Press", "shoulders", "ohp", "5–8", 4),
        A("8–10", 3, "Weighted Pull-Ups|back", "Lat Pulldown|back", "Pull-Up|back"),
        A("10–12", 3, "Chest-Supported Row|back", "Seated Cable Row|back", "Pendlay Row|back"),
        A("12–15", 3, "Lateral Raise|shoulders", "Cable Lateral Raise|shoulders", "Face Pull|shoulders"),
        A("10–15", 3, "EZ-Bar Curl|biceps", "Hammer Curl|biceps", "Cable Curl|biceps")
      ])
    ]
  };

  /* ===== ENDURANCE ===== */
  PROGRAMS.endurance = {
    splitName: { 3: "Intervals / Tempo / Long", 4: "Intervals / Strength Circuit / Tempo / Long", 5: "Intervals / Easy + Mobility / Tempo / Strength Circuit / Long" },
    3: [
      day("Intervals", "VO₂ max & speed", [
        W(),
        C("Hard Intervals", "cardio", "8–10 × 90s hard / 90s easy", "6 × 3min @ threshold / 2min easy", "12 × 60s fast / 60s jog", "5 × 4min @ 10K pace / 2min easy"),
        C("Core finisher", "core", "3 rounds: 45s plank · 30s side plank/side · 20 bicycles"),
        C("Cooldown", "cardio", "8–10 min easy + light stretch")
      ]),
      day("Tempo", "Lactate threshold", [
        W(),
        C("Tempo Effort", "cardio", "20 min @ comfortably-hard", "3 × 8min @ threshold / 2min easy", "25 min progressive (easy→hard)", "2 × 12min @ threshold / 3min easy"),
        C("Hill / Resistance", "cardio", "6 × 45s uphill or high-resistance / walk-back recovery"),
        C("Cooldown", "cardio", "10 min easy + mobility")
      ]),
      day("Long", "Aerobic base — Zone 2", [
        W(),
        C("Long Effort", "cardio", "45–60 min easy Zone-2", "60–75 min easy conversational", "50 min steady Zone-2", "40 min easy + 4 × 20s strides"),
        C("Mobility", "fullbody", "10 min hips, ankles & thoracic mobility")
      ])
    ],
    4: [
      day("Intervals", "VO₂ max & speed", [
        W(),
        C("Hard Intervals", "cardio", "8–10 × 90s hard / 90s easy", "6 × 3min @ threshold / 2min easy", "12 × 60s fast / 60s jog", "5 × 4min @ 10K pace / 2min easy"),
        C("Core finisher", "core", "3 rounds: 45s plank · 30s side plank/side · 20 bicycles"),
        C("Cooldown", "cardio", "8–10 min easy + light stretch")
      ]),
      day("Strength Circuit", "Muscular endurance", [
        W(),
        A("12–20", 3, "Goblet Squat|quads", "Walking Lunge|quads", "Step-Up|quads"),
        A("12–20", 3, "Push-Up|chest", "DB Bench Press|chest", "Incline Push-Up|chest"),
        A("12–20", 3, "Inverted Row|back", "Seated Cable Row|back", "Lat Pulldown|back"),
        A("30–45s", 3, "Plank|core", "Hollow Hold|core", "Dead Bug|core"),
        C("Conditioning", "cardio", "10 min easy spin or row to finish")
      ]),
      day("Tempo", "Lactate threshold", [
        W(),
        C("Tempo Effort", "cardio", "20 min @ comfortably-hard", "3 × 8min @ threshold / 2min easy", "25 min progressive (easy→hard)", "2 × 12min @ threshold / 3min easy"),
        C("Strides", "cardio", "6 × 20s relaxed strides / full recovery"),
        C("Cooldown", "cardio", "10 min easy + mobility")
      ]),
      day("Long", "Aerobic base — Zone 2", [
        W(),
        C("Long Effort", "cardio", "50–70 min easy Zone-2", "70–80 min easy conversational", "55 min steady Zone-2", "45 min easy + 4 × 20s strides"),
        C("Mobility", "fullbody", "10 min hips, ankles & thoracic mobility")
      ])
    ],
    5: [
      day("Intervals", "VO₂ max & speed", [
        W(),
        C("Hard Intervals", "cardio", "8–10 × 90s hard / 90s easy", "6 × 3min @ threshold / 2min easy", "12 × 60s fast / 60s jog", "5 × 4min @ 10K pace / 2min easy"),
        C("Core finisher", "core", "3 rounds: 45s plank · 30s side plank/side · 20 bicycles"),
        C("Cooldown", "cardio", "8–10 min easy + light stretch")
      ]),
      day("Easy + Mobility", "Active recovery", [
        W(),
        C("Easy Aerobic", "cardio", "30–40 min very easy Zone-1/2", "35 min easy spin or walk", "30 min easy + nasal breathing"),
        C("Mobility Flow", "fullbody", "15 min full-body mobility & stretching"),
        A("30–45s", 2, "Dead Bug|core", "Bird-Dog|core", "Glute Bridge|glutes")
      ]),
      day("Tempo", "Lactate threshold", [
        W(),
        C("Tempo Effort", "cardio", "20 min @ comfortably-hard", "3 × 8min @ threshold / 2min easy", "25 min progressive (easy→hard)", "2 × 12min @ threshold / 3min easy"),
        C("Hill / Resistance", "cardio", "6 × 45s uphill or high-resistance / walk-back recovery"),
        C("Cooldown", "cardio", "10 min easy + mobility")
      ]),
      day("Strength Circuit", "Muscular endurance", [
        W(),
        A("12–20", 3, "Goblet Squat|quads", "Walking Lunge|quads", "Step-Up|quads"),
        A("12–20", 3, "Push-Up|chest", "DB Bench Press|chest", "Incline Push-Up|chest"),
        A("12–20", 3, "Inverted Row|back", "Seated Cable Row|back", "Lat Pulldown|back"),
        A("30–45s", 3, "Plank|core", "Hollow Hold|core", "Dead Bug|core")
      ]),
      day("Long", "Aerobic base — Zone 2", [
        W(),
        C("Long Effort", "cardio", "60–80 min easy Zone-2", "75–90 min easy conversational", "65 min steady Zone-2", "50 min easy + 6 × 20s strides"),
        C("Mobility", "fullbody", "10 min hips, ankles & thoracic mobility")
      ])
    ]
  };

  /* ---------- weekday maps (0=Sun ... 6=Sat) ---------- */
  var WEEKDAYS = { 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6] };

  /* ---------- periodization phases ---------- */
  var PHASES = [
    { week: 1, name: "Volume", rpe: "~7", note: "Baseline volume. Leave a couple reps in the tank." },
    { week: 2, name: "Build", rpe: "~8", note: "A touch more load or volume. Push, stay clean." },
    { week: 3, name: "Peak", rpe: "~9", note: "Hardest week of the block. Near your limit." },
    { week: 4, name: "Deload", rpe: "~6", note: "Lighter, fewer sets. Recover and sharpen technique." }
  ];

  /* ---------- experience levels ---------- */
  var EXP_LEVELS = [
    { id: "beginner", name: "Beginner", time: "New to training · 0–12 months", note: "Fewer sets, linear progression — add weight when you hit all your reps.", setDelta: -1 },
    { id: "intermediate", name: "Intermediate", time: "Consistent · 1–3 years", note: "More volume, weekly progression, training around RPE 7–9.", setDelta: 0 },
    { id: "expert", name: "Expert", time: "Advanced · 3+ years", note: "Highest volume and intensity techniques — autoregulate by feel.", setDelta: 1 }
  ];

  /* ---------- PR lifts ---------- */
  var PR_LIFTS = [
    { id: "bench", name: "Bench Press" },
    { id: "squat", name: "Back Squat" },
    { id: "deadlift", name: "Deadlift" },
    { id: "ohp", name: "Overhead Press" },
    { id: "row", name: "Barbell Row" }
  ];

  /* ---------- XP / levels ---------- */
  var XP = { set: 5, workout: 60, pr: 50, steps: 40, makeup: 40, challenge: 150 };
  var LEVEL_TITLES = ["Rookie", "Novice", "Apprentice", "Athlete", "Contender", "Veteran", "Elite", "Champion", "Legend", "Mythic"];
  function xpToReach(level) {
    var n = level - 1;
    return Math.round(120 * n + 30 * n * (n - 1));
  }

  /* ---------- badges ---------- */
  var BADGES = [
    { id: "first-workout", name: "First Rep", icon: "🏁", desc: "Log your first workout." },
    { id: "full-week", name: "Perfect Week", icon: "📅", desc: "Hit every scheduled day in a week." },
    { id: "streak-3", name: "Warmed Up", icon: "🔥", desc: "Reach a 3-day streak." },
    { id: "streak-7", name: "On Fire", icon: "⚡", desc: "Reach a 7-day streak." },
    { id: "streak-30", name: "Unstoppable", icon: "🌋", desc: "Reach a 30-day streak." },
    { id: "first-pr", name: "Personal Best", icon: "🥇", desc: "Set your first PR." },
    { id: "all-prs", name: "Record Holder", icon: "👑", desc: "Set a PR on all five main lifts." },
    { id: "step-goal", name: "Step Up", icon: "👟", desc: "Hit your daily step goal." },
    { id: "workouts-10", name: "Committed", icon: "💪", desc: "Log 10 total workouts." },
    { id: "workouts-50", name: "Iron Will", icon: "🏋️", desc: "Log 50 total workouts." },
    { id: "level-5", name: "Rising Star", icon: "⭐", desc: "Reach level 5." },
    { id: "level-10", name: "Apex", icon: "🚀", desc: "Reach level 10." },
    { id: "makeup-day", name: "No Excuses", icon: "✅", desc: "Log a makeup day." },
    { id: "explorer", name: "Explorer", icon: "🧭", desc: "Try two different programs." },
    { id: "streak-14", name: "Fortnight", icon: "📆", desc: "Reach a 14-day streak." },
    { id: "century", name: "Centurion", icon: "💯", desc: "Log 100 total workouts." },
    { id: "weekend-warrior", name: "Weekend Warrior", icon: "🏕️", desc: "Train on both Saturday and Sunday in one week." },
    { id: "early-bird", name: "Early Bird", icon: "🌅", desc: "Finish a workout before 7am." },
    { id: "night-owl", name: "Night Owl", icon: "🌙", desc: "Finish a workout after 9pm." },
    { id: "volume-10k", name: "Ten Tonnes", icon: "🏗️", desc: "Lift 10,000 total volume (weight × reps)." },
    { id: "volume-50k", name: "Workhorse", icon: "🐎", desc: "Lift 50,000 total volume (weight × reps)." },
    { id: "architect", name: "Architect", icon: "🛠️", desc: "Add a custom exercise to a program day." },
    { id: "globetrotter", name: "Globetrotter", icon: "🗺️", desc: "Try four different programs." },
    { id: "comeback", name: "Comeback Kid", icon: "🔄", desc: "Train again after 7+ days off." },
    { id: "challenger", name: "Challenger", icon: "🎯", desc: "Complete a weekly challenge." }
  ];

  /* ---------- weekly challenges (rotate by ISO week) ---------- */
  var CHALLENGES = [
    { id: "ch-workouts", name: "Consistency", desc: "Complete 3 workouts this week.", metric: "workouts", target: 3 },
    { id: "ch-steps", name: "Step Master", desc: "Walk 35,000 steps this week.", metric: "steps", target: 35000 },
    { id: "ch-pr", name: "New Heights", desc: "Set a new PR this week.", metric: "prs", target: 1 },
    { id: "ch-stepdays", name: "Daily Mover", desc: "Hit your step goal on 4 days.", metric: "stepDays", target: 4 },
    { id: "ch-xp", name: "Grind", desc: "Earn 400 XP this week.", metric: "xp", target: 400 },
    { id: "ch-allsched", name: "Full Card", desc: "Complete every scheduled day.", metric: "scheduled", target: 0 }
  ];

  /* ---------- motivational quotes ---------- */
  var QUOTES = [
    "The bar doesn't care how you feel. Pick it up.",
    "Attack the bar. Own the path.",
    "Discipline is choosing what you want most over what you want now.",
    "You don't find willpower. You build it.",
    "Small lifts, stacked daily, become a strong life.",
    "The path is curved. Keep the bar moving up.",
    "Strong is a skill. Practice it.",
    "Show up on the days you don't want to.",
    "Progress is a heavy thing carried lightly, often.",
    "Rest is part of the program, not a break from it.",
    "Your only competition is yesterday's set.",
    "Consistency beats intensity that doesn't return."
  ];

  /* ---------- alternatives for the main lifts (name -> 2 swaps) ---------- */
  var ALTERNATIVES = {
    "Bench Press": [
      { name: "Dumbbell Bench Press", muscle: "chest" },
      { name: "Weighted Dip", muscle: "chest" }
    ],
    "Back Squat": [
      { name: "Front Squat", muscle: "quads" },
      { name: "Leg Press", muscle: "quads" }
    ],
    "Deadlift": [
      { name: "Trap-Bar Deadlift", muscle: "hamstrings" },
      { name: "Romanian Deadlift", muscle: "hamstrings" }
    ],
    "Overhead Press": [
      { name: "Seated Dumbbell Press", muscle: "shoulders" },
      { name: "Push Press", muscle: "shoulders" }
    ],
    "Weighted Pull-Ups": [
      { name: "Lat Pulldown", muscle: "back" },
      { name: "Chin-Ups", muscle: "back" }
    ],
    "Barbell Row": [
      { name: "Pendlay Row", muscle: "back" },
      { name: "T-Bar Row", muscle: "back" },
      { name: "Dumbbell Row", muscle: "back" }
    ]
  };

  var EXERCISE_LIBRARY = [
    { name: "Barbell Bench Press", muscle: "chest", pr: "bench" },
    { name: "Incline Bench Press", muscle: "chest" },
    { name: "Dumbbell Bench Press", muscle: "chest" },
    { name: "Push-Up", muscle: "chest", bw: true },
    { name: "Cable Fly", muscle: "chest" },
    { name: "Overhead Press", muscle: "shoulders", pr: "ohp" },
    { name: "Dumbbell Shoulder Press", muscle: "shoulders" },
    { name: "Lateral Raise", muscle: "shoulders" },
    { name: "Rear Delt Fly", muscle: "shoulders" },
    { name: "Face Pull", muscle: "shoulders" },
    { name: "Back Squat", muscle: "quads", pr: "squat" },
    { name: "Front Squat", muscle: "quads" },
    { name: "Leg Press", muscle: "quads" },
    { name: "Walking Lunge", muscle: "quads" },
    { name: "Leg Extension", muscle: "quads" },
    { name: "Deadlift", muscle: "hamstrings", pr: "deadlift" },
    { name: "Romanian Deadlift", muscle: "hamstrings" },
    { name: "Leg Curl", muscle: "hamstrings" },
    { name: "Hip Thrust", muscle: "glutes" },
    { name: "Pull-Up", muscle: "back", bw: true },
    { name: "Chin-Up", muscle: "back", bw: true },
    { name: "Lat Pulldown", muscle: "back" },
    { name: "Barbell Row", muscle: "back", pr: "row" },
    { name: "Seated Cable Row", muscle: "back" },
    { name: "Dumbbell Row", muscle: "back" },
    { name: "Barbell Curl", muscle: "biceps" },
    { name: "Dumbbell Curl", muscle: "biceps" },
    { name: "Hammer Curl", muscle: "biceps" },
    { name: "Tricep Pushdown", muscle: "triceps" },
    { name: "Overhead Tricep Extension", muscle: "triceps" },
    { name: "Close-Grip Bench Press", muscle: "triceps" },
    { name: "Plank", muscle: "core", bw: true },
    { name: "Hanging Leg Raise", muscle: "core", bw: true },
    { name: "Cable Crunch", muscle: "core" },
    { name: "Calf Raise", muscle: "calves" },
    { name: "Shrug", muscle: "traps" },
    { name: "Farmer Carry", muscle: "fullbody" },
    { name: "Kettlebell Swing", muscle: "fullbody" },
    { name: "Incline Dumbbell Press", muscle: "chest" },
    { name: "Decline Bench Press", muscle: "chest" },
    { name: "Chest Dip", muscle: "chest", bw: true },
    { name: "Machine Chest Press", muscle: "chest" },
    { name: "Pec Deck", muscle: "chest" },
    { name: "Arnold Press", muscle: "shoulders" },
    { name: "Cable Lateral Raise", muscle: "shoulders" },
    { name: "Upright Row", muscle: "shoulders" },
    { name: "Landmine Press", muscle: "shoulders" },
    { name: "Pendlay Row", muscle: "back" },
    { name: "T-Bar Row", muscle: "back" },
    { name: "Chest-Supported Row", muscle: "back" },
    { name: "Straight-Arm Pulldown", muscle: "back" },
    { name: "Inverted Row", muscle: "back", bw: true },
    { name: "Preacher Curl", muscle: "biceps" },
    { name: "Cable Curl", muscle: "biceps" },
    { name: "Concentration Curl", muscle: "biceps" },
    { name: "Incline Dumbbell Curl", muscle: "biceps" },
    { name: "Skull Crusher", muscle: "triceps" },
    { name: "Triceps Dip", muscle: "triceps", bw: true },
    { name: "Bench Dip", muscle: "triceps", bw: true },
    { name: "Cable Overhead Extension", muscle: "triceps" },
    { name: "Hack Squat", muscle: "quads" },
    { name: "Bulgarian Split Squat", muscle: "quads" },
    { name: "Goblet Squat", muscle: "quads" },
    { name: "Step-Up", muscle: "quads" },
    { name: "Seated Leg Curl", muscle: "hamstrings" },
    { name: "Good Morning", muscle: "hamstrings" },
    { name: "Stiff-Leg Deadlift", muscle: "hamstrings" },
    { name: "Glute Bridge", muscle: "glutes", bw: true },
    { name: "Cable Glute Kickback", muscle: "glutes" },
    { name: "Seated Calf Raise", muscle: "calves" },
    { name: "Standing Calf Raise", muscle: "calves" },
    { name: "Ab Wheel Rollout", muscle: "core", bw: true },
    { name: "Russian Twist", muscle: "core", bw: true },
    { name: "Sit-Up", muscle: "core", bw: true },
    { name: "Dead Bug", muscle: "core", bw: true },
    { name: "Mountain Climbers", muscle: "core", bw: true },
    { name: "Dumbbell Shrug", muscle: "traps" },
    { name: "Rack Pull", muscle: "traps" },
    { name: "Wrist Curl", muscle: "forearms" },
    { name: "Reverse Curl", muscle: "forearms" },
    { name: "Clean and Press", muscle: "fullbody" },
    { name: "Thruster", muscle: "fullbody" },
    { name: "Burpee", muscle: "fullbody", bw: true },
    { name: "Jump Rope", muscle: "cardio" },
    { name: "Incline Walk", muscle: "cardio" },
    { name: "Elliptical", muscle: "cardio" },
    { name: "Stair Climber", muscle: "cardio" },
    { name: "Run", muscle: "cardio" },
    { name: "Row (Erg)", muscle: "cardio" },
    { name: "Stationary Bike", muscle: "cardio" }
  ];
  var EXERCISE_MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core", "traps", "forearms", "cardio", "fullbody"];

  global.BARPATH_DATA = {
    GOALS: GOALS, GOAL_ORDER: GOAL_ORDER, PROGRAMS: PROGRAMS,
    WEEKDAYS: WEEKDAYS, PHASES: PHASES, EXP_LEVELS: EXP_LEVELS,
    PR_LIFTS: PR_LIFTS, XP: XP, LEVEL_TITLES: LEVEL_TITLES, xpToReach: xpToReach,
    BADGES: BADGES, CHALLENGES: CHALLENGES, QUOTES: QUOTES, ALTERNATIVES: ALTERNATIVES,
    EXERCISE_LIBRARY: EXERCISE_LIBRARY, EXERCISE_MUSCLES: EXERCISE_MUSCLES
  };
})(window);
