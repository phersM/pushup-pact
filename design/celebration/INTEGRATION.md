# Celebration — prototype state and integration spec

**Status 2026-09-11: integrated.** The approved take now runs in the app on every target
crossing (`#celebrate-overlay` in `index.html`, the `.cel-*` block in `style.css`,
`showNextCelebration()` / `maybeCelebrate()` in `app.js`). Decisions taken, recorded below
under each section. The prototype stays here, version-controlled, as the reference take.

**Status 2026-08-11:** the prototype is finished and owner-approved ("this is lovely").

- Prototype: `design/celebration/index.html`
- Checkpoint: `index.html.ckpt-bigger-celebration-20260811-1846`
- `design/celebration/` is carved out of the `design/*` ignore rule (2026-09-11), so the
  prototype is committed; its `*.ckpt-*` checkpoints stay local.

---

## What the prototype does

One continuous 12.8s take. Reach the target →

| ms | beat |
|---|---|
| 0–800 | beacon lights on the summit, camera has not moved |
| 826–2950 | camera pushes in to 1.75× on the peak |
| 2560–2980 | **beacon hands off** — shrinks and fades as the flare picks up speed |
| 2600–4700 | flare climbs 300px, streak trailing, camera pulls back out and pans up after it so the peak sits low in frame but never leaves it |
| 4660–4700 | frame flash · camera kick · 24 spokes · 2 shockwaves · 3 rings · 46 confetti flecks |
| 4950–7600 | affirmation lands under the burst, holds, fades into the smoke |
| 7100–11800 | ember floats down, flat, for the **whole** of the camera's return |
| 11800 | ember touches down as the peak settles |
| 11550–12250 | lantern relights on the summit |
| 11900–12800 | UI returns |

Rules that were paid for the hard way and must survive integration:

- **Travel and sway live on separate wrappers** (`.rise` / `.drop` carry translateY,
  the child `.flare` / `.ember` carries opacity + margin sway). One keyframe list
  doing both produced a visible jag at every direction change.
- **Per-keyframe `animation-timing-function`.** A single bezier stretched over the
  nine-stop camera move brakes and restarts at every stop — that is the "stiffness
  in stages" the owner rejected. Same for `dropY`: the fall must stay flat.
- **`forwards`, never `both`, on anything that appears after a delay.** With `both`
  the 0% keyframe paints for the entire delay, which parked a bright ring in the sky
  before the burst had happened.
- **Never two lights on the summit at once.** Fixed at launch (the `handoff`
  keyframe) and again at landing (lantern moved to 11550ms, by which point the ember
  is ~11px above the peak and merging).
- **A scaled border scales too.** A 3px ring at scale 30 is a 90px slab, not a wave.
- Two colours only: the member's colour (`--flare`) and paper (`--peak`). No lime,
  no gold, no orange.

---

## Integration — the real work

The summit anchor is already identical in both: **left 59.56%, top 0.87%**. That is the
only thing that transfers unchanged.

### 1. Scale — the blocker

The prototype's peak container is 145% of a 390px frame ≈ 565px wide, 505px tall. The
app's `.cel-peak` is `min(300px,72vw)`. Every offset in the prototype is **absolute px**
(−300px travel, −310px hang, 150px spoke throw, 245px fleck scatter). Dropped into a
300px box they overshoot by roughly 2×.

Do not rescale by hand. Either:

- **(a)** make the app's celebration peak full-bleed like the prototype's (`.cel-peak`
  becomes `position:absolute; inset:0` inside the overlay, the affirmation absolutely
  positioned over it) — this is what the camera move needs anyway; **or**
- **(b)** express every offset as a fraction of the peak box (`calc()` off a
  `--peak-h` custom property) and let it scale.

(a) is the smaller change and preserves the composition. Recommended.

**Done (2026-09-11), as (a) plus one step:** the overlay holds a `.cel-stage` that IS the
prototype's 390x800 frame, bottom-anchored and scaled by `--cel-s = min(vw/390, vh/800)`.
Scaling the frame rather than the numbers keeps every px offset exactly as tuned.

### 2. The camera needs a wrapper the app does not have

`@keyframes camera` animates `.cam` (`position:absolute; inset:0`) and `.shake` wraps it
so the kick and the camera move never fight over one transform. The app's overlay is a
flex column (`.celebrate-inner` → `.cel-peak` + `.celebrate-line`). Both wrappers have to
be added, and the affirmation has to come out of the flex flow.

### 3. Duration

12.8s is right for a standalone piece and **too long for something that fires every time
you hit target, daily**. The app currently dwells 6200ms. Options, in order of preference:

1. Compress: the cheapest cut is the 6.8→7.1s dead beat between the title fading and the
   ember starting, plus tightening the smoke tail. Gets to roughly 10s.
2. Shorten the ember fall and the camera return together — they are locked to each other
   and must stay locked (the ember lands as the peak settles).
3. Leave it and rely on tap-to-skip. `showNextCelebration()` already binds
   `overlay.addEventListener("click", dismissCelebration, { once: true })`.

**Owner decision required.** Do not pick one silently.

**Decided 2026-09-11: compress to ~10s.** Everything up to and including the line is the
approved take to the millisecond. After it: the ember leaves at 6600 (as the line fades —
the dead beat is gone), the camera holds the sky until 7300 and comes home over 2300ms, and
the ember lands with it at 9600. Lantern relights 9350; the overlay fades home 9900–10500.
Smoke tails shortened (A 3400ms, B 3700ms from 5700), halo C 3200ms.

### 4. `prefers-reduced-motion`

The prototype has **no** reduced-motion path — it is a motion study. The app has a global
rule and `showNextCelebration()` already branches (`reduced ? 1800 : 6200`). The
integrated version needs a static or near-static variant: beacon lights, affirmation
appears, done.

**Done:** `.reduced` instead of `.playing` — mountain, lantern lit, line, one opacity
cross-fade, 2400ms. The line sits at 11% there (not 24%) because the camera never pans up.

### 5. Member colour

`--flare` is set per-theme on `.frame` in the prototype and swapped by the colour buttons.
In the app it must come from the signed-in member's profile colour — this was settled
earlier ("the light mode should not use a grey dot, it should replicate the colour of the
profile"). Set it as a custom property on the overlay when the celebration opens.

**Done:** `celebrationFlare()`. Pine is lifted to teal in dark mode only — #0B3B34 on the
#081F1B paper is invisible.

### 6. Affirmations — already done, do not port

The prototype carries its own local 30-line `AFFIRMATIONS` array. **Drop it.** The app
already has `DEFAULT_AFFIRMATIONS`, `affirmations()`, `pickAffirmation()` (never repeats
back-to-back) and the admin editor (`#affirm-card`, `renderAffirmEditor`, 30-char /
40-line limits). The integrated celebration calls `pickAffirmation()`.

### 7. Streak celebration

`maybeCelebrateStreak()` queues a second celebration kind. It currently shares the same
overlay. Decide whether a streak milestone gets the same full sequence or a shorter cut —
firing 12.8s twice back to back (target met *and* streak) would be punishing. The queue
in `showNextCelebration()` already serialises them with a 250ms gap.

**Done:** same take for both, never two on one commit. `maybeCelebrate()` runs
`decideCelebrations()` (logic.js, tested): target + milestone on one commit collapses to the
streak. If that milestone already played, the target still gets its moment.

---

## Verification

The prototype (2026-08-11) was verified by code review plus scripted checks, below. The
integration (2026-09-11) was also checked in the in-app browser at 375x812, dark and light:
triggered for real by banking past the target, then paused and scrubbed frame by frame
(beacon, push-in, climb, burst, line, ember fall, settle, and the reduced static take).

Prototype checks:

- CSS brace balance across the `<style>` block
- DOM tree parsed and nesting confirmed (`.shake` wraps `.cam`, `.whiteout` is a sibling
  of `.title` inside `.scene`, shockwaves live inside `.burst`)
- every `@keyframes` referenced and every reference defined — no orphans
- full animation timeline dumped and checked stop by stop
- inline script passes `node --check`

**None of the visual judgement is verified.** Pacing, flash intensity and whether the
camera kick reads as impact or as a glitch were all owner calls made by watching it.
