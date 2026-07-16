// Ideal rep range per exercise — grounded in general strength & hypertrophy
// training guidance (heavy compounds lower-rep for strength/CNS efficiency,
// isolation/single-joint work higher-rep, small stabiliser muscles and calves
// respond well to higher reps). Ranges deliberately match the same bands the
// AI coach already uses when drafting routines (see coach.js DRAFTING RULES)
// so targets are consistent app-wide.
//
// Keyed by the exact name in exercises.js. Exercises tracked by time/distance
// (logType 'duration'/'cardio') have no rep range — trained by time instead.
export const REP_RANGES = {
  // ── Chest ──
  'Bench Press (Barbell)':           [5, 8],
  'Bench Press (Dumbbell)':          [6, 10],
  'Incline Bench Press (Barbell)':   [6, 10],
  'Incline Bench Press (Dumbbell)':  [6, 10],
  'Decline Bench Press':             [6, 10],
  'Chest Fly (Dumbbell)':            [10, 15],
  'Cable Fly':                       [10, 15],
  'Push Up':                        [10, 20],
  'Chest Dip':                       [6, 12],
  'Machine Chest Press':             [8, 12],
  'Pec Deck':                        [10, 15],
  // ── Back ──
  'Deadlift (Barbell)':              [3, 6],
  'Romanian Deadlift':               [8, 12],
  'Sumo Deadlift':                   [3, 6],
  'Pull Up':                         [6, 10],
  'Chin Up':                         [6, 10],
  'Lat Pulldown':                    [8, 12],
  'Seated Cable Row':                [8, 12],
  'Bent Over Row (Barbell)':         [6, 10],
  'Bent Over Row (Dumbbell)':        [8, 12],
  'T-Bar Row':                       [8, 12],
  'Single Arm Dumbbell Row':         [8, 12],
  'Face Pull':                       [12, 20],
  'Rack Pull':                       [3, 6],
  'Cable Row (Wide Grip)':           [8, 12],
  'Straight Arm Pulldown':           [10, 15],
  // ── Shoulders ──
  'Overhead Press (Barbell)':        [5, 8],
  'Overhead Press (Dumbbell)':       [6, 10],
  'Lateral Raise (Dumbbell)':        [12, 20],
  'Lateral Raise (Cable)':           [12, 20],
  'Front Raise (Dumbbell)':          [10, 15],
  'Arnold Press':                    [8, 12],
  'Rear Delt Fly (Dumbbell)':        [12, 20],
  'Rear Delt Fly (Cable)':           [12, 20],
  'Upright Row':                     [8, 12],
  'Machine Shoulder Press':          [8, 12],
  'Cuban Press':                     [10, 15],
  // ── Biceps ──
  'Barbell Curl':                    [8, 12],
  'Dumbbell Curl':                   [8, 12],
  'Hammer Curl':                     [8, 12],
  'Incline Dumbbell Curl':           [8, 12],
  'Cable Curl':                      [8, 12],
  'Preacher Curl':                   [8, 12],
  'Concentration Curl':              [10, 15],
  'Spider Curl':                     [8, 12],
  'Reverse Curl':                    [10, 15],
  // ── Triceps ──
  'Tricep Pushdown (Cable)':         [10, 15],
  'Skull Crusher':                   [8, 12],
  'Overhead Tricep Extension':       [8, 12],
  'Close Grip Bench Press':          [6, 10],
  'Tricep Dip':                      [8, 12],
  'Diamond Push Up':                 [10, 15],
  'Tricep Kickback':                 [12, 15],
  // ── Quads ──
  'Squat (Barbell)':                 [5, 8],
  'Front Squat':                     [6, 10],
  'Leg Press':                       [8, 12],
  'Hack Squat':                      [8, 12],
  'Leg Extension':                   [10, 15],
  'Bulgarian Split Squat':           [8, 12],
  'Lunge (Barbell)':                 [8, 12],
  'Lunge (Dumbbell)':                [8, 12],
  'Goblet Squat':                    [8, 12],
  'Sissy Squat':                     [10, 15],
  // ── Hamstrings ──
  'Leg Curl (Lying)':                [10, 15],
  'Leg Curl (Seated)':               [10, 15],
  'Nordic Hamstring Curl':           [5, 10],
  'Romanian Deadlift (Dumbbell)':    [8, 12],
  'Good Morning':                    [6, 10],
  'Glute Ham Raise':                 [6, 10],
  // ── Glutes ──
  'Hip Thrust (Barbell)':            [8, 12],
  'Hip Thrust (Bodyweight)':         [12, 20],
  'Cable Kickback':                  [12, 15],
  'Sumo Squat':                      [8, 12],
  'Step Up':                         [8, 12],
  'Abductor Machine':               [12, 20],
  'Donkey Kick':                     [12, 15],
  // ── Calves ──
  'Calf Raise (Standing Machine)':   [12, 20],
  'Calf Raise (Seated Machine)':     [12, 20],
  'Calf Raise (Barbell)':            [12, 20],
  'Calf Raise (Leg Press)':          [12, 20],
  // ── Core ──
  'Crunch':                          [15, 25],
  'Cable Crunch':                    [10, 15],
  'Leg Raise (Hanging)':             [10, 15],
  'Leg Raise (Lying)':               [12, 20],
  'Russian Twist':                   [15, 25],
  'Ab Wheel Rollout':                [8, 15],
  'Decline Sit Up':                 [12, 20],
  'Dragon Flag':                     [5, 10],
  'Pallof Press':                    [10, 15],
};

// Exercises that are trained by time/hold or by count-of-skips rather than a
// scientific rep range (planks etc. are also caught by app.js's DURATION_NAMES
// logType inference — this set only needs to cover the odd one out, Jump Rope).
const NO_RANGE = new Set(['Jump Rope']);

// Fallback bands by muscle group, used for anything not in REP_RANGES above
// (new custom exercises before/without an AI lookup, or any future addition).
const CATEGORY_DEFAULT = {
  Chest:      [8, 12],
  Back:       [8, 12],
  Shoulders:  [10, 15],
  Biceps:     [8, 12],
  Triceps:    [8, 12],
  Quads:      [8, 12],
  Hamstrings: [8, 12],
  Glutes:     [10, 15],
  Calves:     [12, 20],
  Core:       [12, 20],
  Cardio:     null,
};

// Resolve the ideal rep range for an exercise. `ex` is anything shaped like
// { name, category, logType, repRange? } — repRange (from a saved custom
// exercise, possibly AI-sourced) always wins when present.
export function resolveRepRange(ex) {
  if (!ex || NO_RANGE.has(ex.name)) return null;
  if (ex.logType === 'duration' || ex.logType === 'cardio') return null;
  if (ex.repRange && Number.isFinite(ex.repRange.min) && Number.isFinite(ex.repRange.max)) {
    return ex.repRange;
  }
  const known = REP_RANGES[ex.name];
  if (known) return { min: known[0], max: known[1] };
  const fallback = CATEGORY_DEFAULT[ex.category];
  return fallback ? { min: fallback[0], max: fallback[1] } : null;
}

// ── AI lookup for new/custom exercises ────────────────────────────────────────
// Uses the same Anthropic key + model as the AI coach. Returns { min, max } or
// null on any failure (no key, offline, bad response) — callers fall back to
// the category default above, so the UI always has something sensible to show.
const MODEL = 'claude-sonnet-5';
const RANGE_TOOL = {
  name: 'rep_range',
  description: 'Report the ideal training rep range for one exercise, based on current strength & hypertrophy research.',
  input_schema: {
    type: 'object',
    properties: {
      min: { type: 'integer', description: 'Lower bound of the ideal rep range per set.' },
      max: { type: 'integer', description: 'Upper bound of the ideal rep range per set.' },
    },
    required: ['min', 'max'],
  },
};

export async function fetchAIRepRange({ name, category, getKey }) {
  try {
    const key = await getKey?.();
    if (!key || !name) return null;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        tools: [RANGE_TOOL],
        tool_choice: { type: 'tool', name: 'rep_range' },
        messages: [{
          role: 'user',
          content: `Exercise: "${name}" (muscle group: ${category || 'unknown'}). What's the ideal rep range per working set for general strength/hypertrophy training? Call rep_range with your answer.`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const block = (data.content || []).find(b => b.type === 'tool_use');
    if (!block) return null;
    const min = parseInt(block.input?.min, 10);
    const max = parseInt(block.input?.max, 10);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) return null;
    return { min, max: Math.min(max, 50) };
  } catch (_) {
    return null;
  }
}
