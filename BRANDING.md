# ARC — Brand & Design System

> The single source of truth for how the app looks, sounds, and feels. Read this
> before building or restyling any feature. It doubles as the design-system
> reference — the tokens and rules here already match what's implemented in
> `styles.css`, `workout/index.html`, and `shared/icons.js`.

---

## 0. Decisions to confirm (change these and everything else follows)

These three levers were chosen to fit the direction you've steered toward all
along (near-black + electric sky-blue, "sleek/cool," premium-minimal,
data-driven). If you want a different call on any, change it here and I'll
propagate it through the doc and the app:

| Lever | Chosen | Strong alternates |
|---|---|---|
| **Name** | **ARC** | VOLT · FORGE · APEX · TEMPO |
| **Accent** | **Electric Sky** `#38bdf8` (current) | Volt-lime · Molten · Violet |
| **Coach voice** | **Direct & precise** | Encouraging-hype · Technical |

Nothing in the app is renamed to "ARC" yet — that's a deliberate, separate step
once the name is locked (tab title, PWA install name, in-app header, icon
wordmark, manifests). Say the word and I'll do the rename in one pass.

---

## 1. The name

**ARC.**

- **What it means.** The arc of a rep's path. The arc of progress over months.
  An *electric* arc — energy, charge, the neon-blue glow that runs through the
  UI. Three letters, sharp, abstract, premium. Easy to say, impossible to
  mistake, ages well.
- **How to write it.** `ARC` in the wordmark (all caps). In running text, "Arc"
  is fine. Never "A.R.C." (it's not an acronym) and never lowercase in the logo.
- **Tagline (pick one, all on-brand):**
  - **Train with intent.** ← recommended
  - Every rep, measured.
  - Strength, sharpened.

**Why not the others** (kept for reference): *VOLT* leans harder into the
electric theme but is widely used; *FORGE* is warmer/craftsman but less
electric; *APEX* is competitive-premium but common in fitness; *TEMPO* is calm
and disciplined but softer than the app's edge.

---

## 2. Brand personality

ARC is **the quiet professional** — a high-end tool, not a hype machine.

**Five adjectives:** Precise · Confident · Minimal · Fast · Honest.

**It is:** focused, data-forward, respectful of your time, quietly premium.
**It is not:** loud, gamified, cluttered, "bro," salesy, or cute.

The feeling on open: *this is a serious instrument for serious training.* Black
canvas, one electric accent, numbers that matter, nothing shouting for
attention.

---

## 3. Voice & tone (incl. the AI Coach)

**Voice = direct & precise.** Short sentences. Say the useful thing, then stop.
Explain the *why* in one clause, not a paragraph. Never hype for its own sake;
let a real PB speak for itself.

| Do | Don't |
|---|---|
| "Triceps are lagging — swap in overhead extensions." | "OMG your triceps need some LOVE 💪🔥 let's gooo!!!" |
| "New best: 100 kg × 8." | "AMAZING WORK SUPERSTAR!!!" |
| "Rest done — next set." | "Time to crush it champ!" |
| "No workout in 6 days." | "We've missed you! Don't give up on yourself 🥺" |

**Rules of thumb**
- Second person ("you"), present tense, active voice.
- Numbers over adjectives. "+12 kg since May," not "great progress."
- At most **one** emoji per surface, and only where it carries meaning
  (🏆 PB, 🔥 streak). Prefer a Lucide icon to an emoji everywhere else.
- British English (kg, "programme" is fine, "colour" in copy).
- Errors are calm and instructive: *"That API key was rejected (401). Tap the
  key to update it."* — never blame, never panic.

**Coach persona:** an experienced strength coach who's seen your numbers and
doesn't waste your time. Confident, a little blunt, always backs a suggestion
with the reason. When it proposes a routine change, it's specific and
actionable, never vague.

---

## 4. Logo & app mark

**Primary mark:** the neon **dumbbell** — a chunky, diagonal dumbbell in the
electric-sky gradient with a soft outer glow, on the near-black tile (see
`workout/icon.png`). It's the whole identity in one glyph: strength + the
electric charge.

**Construction rules**
- Glyph sits inside the **maskable safe zone** (~80% centre) so iOS/Android
  corner-rounding never clips it.
- Gradient runs bottom-left → top-right: `#2f9fe8 → #8ee3ff`.
- Glow: `drop-shadow` in `#38bdf8` at ~50% — subtle, not a bloom.
- Background: the app's aurora-dark tile (`linear-gradient(160deg,#12121c,#08080c)`
  with faint sky/violet corner auroras). No flat black — it should have depth.

**Wordmark:** `ARC` set in Google Sans **Bold**, tight tracking (`-0.02em`),
optionally with the electric-sky as a subtle left-to-right gradient on the
letters. Lockup = mark left, wordmark right, with the mark's height ≈ cap
height × 1.4.

**Don't:** recolour the mark arbitrarily, add a flame/heart/generic swoosh, put
it on a pure-white or busy background, or stretch/skew it.

---

## 5. Colour system

Near-black canvas, **one** electric accent, a small set of semantic signals.
Colour is used sparingly — the accent should feel earned. (These are the live
`styles.css` / `workout` tokens.)

### Surfaces (neutral, near-black)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0b0b10` | App background / canvas |
| `--surface` | `#15151c` | Cards, tiles, sheets, tab bar fill |
| `--surface2` | `#1e1e26` | Inputs, chips, nested surfaces |
| `--text` | `#f2f2f7` | Primary text |
| `--text-muted` | `#8e8e9a` | Secondary text, labels, captions |
| `--border` | `rgba(255,255,255,0.07)` | **Hairline** on every raised surface |

### Accent (the electric charge)
| Token | Hex | Use |
|---|---|---|
| `--blue` (primary) | `#38bdf8` | Primary actions, active states, links, focus rings, the glow |
| — gradient | `#2f9fe8 → #8ee3ff` | CTAs, logo, hero moments |

**Rule:** exactly one primary accent. Everything interactive that's "the main
thing" is electric-sky; everything else is neutral. If two blue things compete,
one of them is wrong.

### Semantic signals (used only for their meaning — never decoration)
| Meaning | Token | Hex |
|---|---|---|
| Personal best / streak / warm-up | `--amber` | `#fbbf24` |
| Success / set done / restored | `--green` | `#34d399` |
| Destructive / error / drop-set warn | `--red` | `#f43f5e` |
| Superset / AI suggestion / drop-set | `--purple` | `#a78bfa` |

Category colours (muscle groups) live in `CATEGORY_COLORS` — those are data
viz, kept distinct from brand colour.

**When re-theming:** the accent appears as **hex *and* rgb triplets** in many
`rgba()` literals (`56,189,248`). Sweep both. Update the two `manifest.json`
`theme_color`/`background_color` and both `<meta name="theme-color">` too.

---

## 6. Typography

- **Typeface:** **Google Sans** (loaded from the Google Fonts v1 CSS API),
  falling back to `Product Sans, Roboto, -apple-system, system-ui`. Geometric,
  friendly-but-precise, unmistakably modern.
- **One weight hierarchy, three weights only** (`styles.css` tokens):
  | Token | Weight | Use |
  |---|---|---|
  | `--fw-regular` | 400 | Body copy, secondary text |
  | `--fw-medium` | 500 | Labels, tabs, chips, buttons |
  | `--fw-bold` | 700 | Titles, headings, emphasis, numbers-that-matter |
- **Tracking:** tighten large/bold headings slightly (`-0.3px`…`-0.5px`); leave
  body at default. UPPERCASE micro-labels get **+0.06em** letter-spacing.
- **Numbers are first-class.** Stats, weights, PBs and timers use bold, often
  tabular (`font-variant-numeric: tabular-nums`) so digits don't jitter.
- Minimum input font-size **16px** (iOS zoom guard) — non-negotiable.

---

## 7. Iconography

- **Lucide**, line style, `stroke-width: 2`, `currentColor` (inherits text/accent
  colour). Vendored subset in `shared/icons.js` — add new ones there, don't pull
  a CDN.
- Line icons everywhere for chrome and actions. **Emoji only** for the two
  reward signifiers (🏆 PB, 🔥 streak) and nowhere else.
- Consistent sizes: 20–24px in nav/buttons, 15–17px inline with text, 12–14px as
  tiny adornments. Vertical-align tuned so icons sit on the text baseline.

---

## 8. UI principles (how ARC is built)

1. **Black-first, glow-second.** Near-black canvas; the accent glows out of it.
   Depth comes from **hairline borders + subtle gradients**, not from lightening
   fills or heavy shadows.
2. **One primary action per screen.** It's the only gradient/glow button.
   Everything else is quiet (ghost/outline/`--surface2`).
3. **Content over chrome.** No decorative panels. Every pixel earns its place —
   if it's not data, an action, or a label, cut it.
4. **Frosted, floating system chrome.** The tab bar is translucent + blurred
   (`backdrop-filter`), anchored to the bottom edge through the safe area.
5. **Motion is quick and physical.** 150–300ms, ease-out. Press states scale
   ~0.98. Skeleton shimmer while data loads. Nothing bounces or lingers.
6. **Gestures reward mastery, taps are always available.** Swipe a set to
   delete/drop, long-press to reorder — but there's always a visible tap path
   too (the "…" menu, the set-number tap).
7. **The workout is a focused surface.** Full-screen overlay, locked background,
   keyboard-aware. When you're training, nothing else exists.
8. **Never lose data, always reassure.** Local-first + cloud + exportable file.
   When something's syncing/restoring, say so; when it's saved, don't nag.

---

## 9. Naming & microcopy conventions

- **Features get plain, confident names:** "Coach," "Routines," "Library,"
  "Backup & restore," "Improve my routines." No cutesy sub-brands.
- **Sentence case** for buttons and labels ("Back up to cloud now"), **Title
  Case** only for screen titles and the wordmark.
- **Verbs on buttons** ("Restore from cloud," "Add exercise," "Finish"), nouns
  on tabs ("Stats," "Coach," "Library").
- **Counts are specific:** "Restored 452 items — 447 workouts." Not "Done!"
- **Empty states teach the next step:** "No history yet. Restore from cloud, or
  import a backup, in Stats." — never a dead end.

---

## 10. Applications & checklist

When shipping anything new, it's on-brand if:

- [ ] Near-black surface with a **hairline border**; one electric-sky primary
      action, everything else neutral.
- [ ] Google Sans, weights 400/500/700 only; numbers bold, tabular where they
      change.
- [ ] Lucide line icons (from `shared/icons.js`); at most one meaningful emoji.
- [ ] Copy is direct, second-person, numbers over adjectives, ≤1 emoji.
- [ ] Motion 150–300ms ease-out; press-scale on the primary action.
- [ ] Works keyboard-open and offline; nothing can leak the background behind an
      overlay; data changes are reflected in the cloud.
- [ ] Touch targets ≥ 44px; inputs ≥ 16px; safe areas respected top and bottom.

---

## 11. To implement the ARC name (when confirmed)

A single pass updates: `workout/index.html` `<title>` + `apple-mobile-web-app-title`
+ in-app `#mainTitle` header; `workout/manifest.json` `name`/`short_name`; the
icon wordmark; and any "Gym App" strings. The root hub is retired, so only the
`workout/` app needs renaming. Ask and it's done.
