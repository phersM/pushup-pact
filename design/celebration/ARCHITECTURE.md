# Celebration integration — architecture

Written 2026-08-11, before any code. Companion to `INTEGRATION.md` (which is the
prototype's handover). This file is the *plan for the app*: what gets built, where
it lives, and the decisions that fork the work.

Scope: two celebration events (daily target met, 7-day streak milestone) and the
admin-editable affirmation bank behind the admin lock.

---

## 0. What already exists (verified in code, not assumed)

**The affirmation bank is built and shipped.** Second half of the ask is ~85% done:

| piece | where | state |
|---|---|---|
| 30 default lines | `app.js:285` `DEFAULT_AFFIRMATIONS` | done |
| resolver (crew bank → fallback) | `app.js:294` `affirmations()` | done |
| picker, no back-to-back repeat | `app.js:300` `pickAffirmation()` | done, but weak — see §5 |
| admin editor UI | `index.html:496` `#affirm-card` | done |
| live validation, 30-char / 40-line caps, dedupe | `app.js:1375` `affirmParse/affirmCount` | done |
| admin lock ("Knot") reveals it | `app.js:1357` inside `tryAdminCode()` | done |
| persistence, crew-wide via settings jsonb | `affirm-save` → `saveSettings` | done |

What is **not** done: the picker repeats too often for daily use (§5.1), the 30-char
cap does not match the type size the prototype's headline actually uses (§5.2), and
the streak lines (`STREAK_CELEBRATE_LINES`, `app.js:308`) are hardcoded constants that
the admin cannot touch (§5.3).

**The app already draws a full-screen mountain.** `.app-peak` + `.app-lantern`
(`index.html:267`, `style.css:1333`) — `position:fixed`, `height:46vh`, `bottom:-6vh`,
z-index 0, behind every screen. `updatePeakFill()` (`app.js:1490`) fills it with
today's tally, walks a marker up the traced route, and **lights the summit lantern at
exactly the moment `tally >= target`** — i.e. the same instant the celebration fires.

That last fact is the whole architectural question (§1).

**The overlay currently draws a *third* mountain.** `#celebrate-overlay` →
`.cel-peak` at `min(300px,72vw)` with its own flare/burst. That is the thing being
replaced.

---

## 1. DECIDED — where the celebration is staged

> **Option B, self-contained overlay.** Locked 2026-08-11. Option A stays on the table
> as a later upgrade; §2's shared `--stage-h` is what keeps that door open.

### Option A — adopt the real mountain (not now)

The overlay becomes a transparent scrim. The app's own `.app-peak`/`.app-lantern`
get camera wrappers, are promoted above the UI for the duration, and the UI fades out
underneath. The prototype's "beacon lights first" beat **is** `.app-lantern.is-lit`,
which has already lit. The camera then pushes into the mountain the user has been
filling all day.

- Continuity is total. No cross-fade, no duplicate summit, no second asset.
- Solves the prototype's "never two lights on the summit" rule structurally.
- Structural work: wrap both in `.peak-stage > .shake > .cam` (all
  `position:fixed/absolute; inset:0`), flip `.app-peak`/`.app-lantern` from `fixed`
  to `absolute` inside it, add `body.celebrating` to raise the stage's z-index above
  `#app>main` (1), `.app-head` (3) and `.tabbar` (40) and fade those three out.
- Risk: touches the functional watermark shipped 2026-08-11 — the one with the
  `@property` registration, `inherits:true`, mask-flattening and `getPointAtLength`
  traps already paid for. A transform on the wrong element there costs a day.

### Option B — self-contained stage double (CHOSEN)

The overlay keeps its own mountain, but rebuilt full-bleed at **exactly** the app's
geometry (`height:46vh; bottom:-6vh`, same mask, same summit anchor) so that opening
it reads as the app furniture getting out of the way, not as a scene change. All
`.cel-*` CSS stays fenced inside `#celebrate-overlay`.

- Nothing outside the overlay changes. Trivially revertable.
- The real watermark is behind an opaque `var(--paper)` backdrop — never visible, so
  the duplicate never shows.
- Cost: two mountains in the stylesheet, and the geometry must be kept in sync by a
  shared constant rather than by construction.

Rationale for choosing B: with browser automation banned, the first integration should
be the one whose blast radius stops at one overlay. A is the better end state and B does
not block it — geometry shared through one variable makes A a later re-parent, not a
rewrite.

---

## 2. Scale — kill the 2× overshoot by construction

`INTEGRATION.md §1` is right that the prototype's absolute px overshoot, but rescaling
by hand is the wrong fix and so is full-bleed alone: the prototype was tuned in a
390×800 frame and phones are not that.

**Every mountain-anchored offset becomes a fraction of one variable.**

```css
#celebrate-overlay{ --stage-h:46vh; }          /* == .app-peak height, one source */
```

Derived from the prototype (stage height there = 505.9px):

| quantity | prototype | factor | integrated |
|---|---|---|---|
| flare rise / streak length | 300px | .593 | `calc(var(--stage-h) * .593)` |
| ember hang | 310px | .613 | `calc(var(--stage-h) * .613)` |
| spark throw | 150px | .297 | `calc(var(--stage-h) * .297)` |
| spark length | 52px | .103 | `calc(var(--stage-h) * .103)` |
| fleck scatter | 95–340px | .188–.672 | JS, same factors × stage px |
| flare/ember dot | 9px | .018 | `calc(var(--stage-h) * .018)` |

Frame-anchored things (smoke, whiteout, halos, title position) stay in `vh`/`vw`/`%` —
they belong to the viewport, not the mountain. The flecks are generated in JS, so they
read `--stage-h` once via `getComputedStyle` and scale the same factors.

Summit anchor is unchanged in both worlds: **left 59.56%, top 0.87%** of the box.

---

## 3. DECIDED — timing: frequency sets length

> **Tiered.** Locked 2026-08-11.

`INTEGRATION.md §3` asks "how do we shorten 12.8s", and §7 asks "should the streak get
a shorter cut". Both point the same way once you invert them:

**Target met fires roughly daily. A streak milestone fires one day in seven. The rare
event should be the long one.**

| event | cut | length |
|---|---|---|
| target met | **short** — beacon → flare → burst → line → lantern relights | ~6.5s |
| 7-day streak | **full** — the whole prototype take with the camera move | 12.8s |
| both on one tap | **full**, once, with the streak headline and the affirmation as the sub-line | 12.8s |

The short cut is the full cut with three excisions, not a different sequence:
drop the camera push-in/pan (`camera`, `shake` keep only the kick), cut the 6.8→7.1s
dead beat, and shorten the ember fall + camera return **together** (they are locked —
the ember must land as the peak settles).

Tap-to-skip stays either way (`overlay.addEventListener("click", dismissCelebration,
{ once: true })` already exists).

---

## 4. Code architecture

### 4.1 Split the decision from the presentation

Right now `maybeCelebrateTargetMet` / `maybeCelebrateStreak` both compute *and* fire,
and the queue carries a bare string. With two events, two cuts, a headline and a sub,
that stops holding. Move the decision into `logic.js` (pure, dependency-free, already
the tested module):

```js
// logic.js — pure, no DOM, unit-testable
export function decideCelebrations({ beforeTally, repsAdded, target, streakDays }) {
  // → []                                            nothing crossed
  // → [{ kind:"target", cut:"short" }]               target met
  // → [{ kind:"streak", cut:"full", days:7 }]        milestone only
  // → [{ kind:"streak", cut:"full", days:7,          both — one play, streak wins,
  //      alsoTarget:true }]                          and the bag is not drawn from
}
```

It returns an array rather than a single item so the "both" collapse is a decision the
tests can pin, not an accident of firing order — and so a future third event kind does
not need the shape to change again.

`app.js` keeps the side effects: one-shot localStorage guard, copy selection, queue,
DOM. This is what makes the whole feature testable without a browser — which matters
more here than usual, because the browse ban means there is no other way to verify it.

### 4.2 The queue carries a descriptor, not a string

```js
{ kind: "target" | "streak",
  id: "2026-08-11" | "7",
  cut: "short" | "full",
  headline: "…",     // Bebas, large
  sub: "…",          // JetBrains Mono, tracked, small
  flare: "#2E7CF6" }  // the member's own avatar colour
```

Copy mapping (uses the two title slots the prototype already has — headline is Bebas,
auto-sized per §5.2; sub is JetBrains Mono, small, tracked, uppercase, so it reads as a
label and never as a sentence):

| event | headline | sub |
|---|---|---|
| target | `pickAffirmation()` — 1 of 30+, bagged | `TARGET MET · 70 OF 70` |
| streak | `streakLine(7)` — 1 of 5 fixed slots | `7 DAY STREAK` |
| both | `streakLine(7)` | `TARGET MET · 7 DAY STREAK` |

When both land on one commit the streak supersedes, and **the affirmation bag is not
drawn from** — no line is silently burned on a celebration that never showed it.

### 4.3 Member colour

`--flare` is set on the overlay when the celebration opens, from
`avatarParts(state.me.avatar).color` (`app.js:180`, `AVATAR_COLORS` at `app.js:177`) —
the same colour `updatePeakFill()` already pushes into `--trail-me`. Falls back to
`--peak-ink` only if the profile has no colour. Settled earlier: **never a grey dot,
profile colour in both themes.**

### 4.4 Reduced motion

The prototype has no reduced-motion path. The integrated version needs a real one, not
a global `animation-duration:.01ms` — that fires the whole burst as one frame-flash,
which is worse than nothing for someone who asked for less motion:

> mountain visible, lantern already lit, headline + sub fade in over 400ms, hold 1.8s,
> dismiss. No camera, no shake, no whiteout, no flecks.

Existing `showNextCelebration()` already branches on the media query; that branch
becomes a class on the overlay (`.cel-reduced`) rather than just a shorter timer.

### 4.5 Files touched

| file | change |
|---|---|
| `logic.js` | + `decideCelebrations()`, + `nextFromBag()` (both pure) |
| `app.js` | rewrite `maybeCelebrate*` to call it; descriptor queue; `--flare`; `--stage-h` read for flecks; affirmation bag (§5.1); headline sizing (§5.2); `streakLine()` + `#streak-card` editor (§5.3) |
| `index.html` | replace `.cel-peak` block with the staged markup (`.shake > .cam`, streak, rise/drop wrappers, burst, flecks, smoke, whiteout, two-slot title); + `#streak-card` admin card |
| `style.css` | replace the `.cel-*` block (`style.css:1070–1136`) with the factored sequence; + `#streak-card` rows reusing `.lbl`/`.affirm-actions` |
| `tests/` | + `celebration.test.js` (decision fn, bag, `streakLine` fallbacks), + timeline harness (§6) |

---

## 5. The affirmation banks — the remaining work

> **Decided 2026-08-11:** shuffled bag (5.1), auto-sized headline keeping the generous
> character cap (5.2), and a **second admin-editable bank of 5 fixed streak slots**
> (5.3). Admins keep full add / edit / remove on the main bank.

### 5.1 Shuffled bag, not random-with-one-guard

`pickAffirmation()` avoids repeating the *previous* line only. Over 30 lines fired
daily, the same line recurs within a week often enough to notice, which undoes the
point of having 30. Replace with a **shuffled bag**: shuffle all 30, draw in order,
reshuffle when empty (and ensure the new bag's first line isn't the old bag's last).

- Persist the bag + cursor in `localStorage` (`pushpact-affirm-bag`) so a reload does
  not restart it. Per device, per profile — it is a delight detail, not shared state.
- Reset the bag whenever the admin saves a new bank, or the bank length changes.
- Pure function in `logic.js`, so it is unit-testable: `nextFromBag(bank, bagState)`.

Result: 30 distinct lines before any repeat ≈ one month.

### 5.2 The 30-character cap does not match the type

The prototype's headline is Bebas `clamp(54px,15vw,74px)` at `.13em` tracking. On a
390px screen that is ~74px — **"Roped in, topped out" (20 chars) already wraps to
three lines at that size.** The current cap is 30. So either:

- **(a) lower `AFFIRM_MAX` to ~18–20** and let the headline stay one size; or
- **(b) auto-size by length** — a JS-set class (`.len-s ≤12` → 74px, `.len-m ≤20` →
  56px, `.len-l` → 42px) and keep the 30 cap.

**Chosen: (b).** Since admins write their own lines, nothing they type should be
rejected for being a few characters long. Length changes the size, it never blocks the
save. `AFFIRM_MAX` stays as a *soft* ceiling (the point where even the smallest step
wraps); the editor's live counter reports the real size steps instead of one number
that no longer means anything, and the hint says what actually happens.

Size steps, applied as a class on the headline by JS at open time:

| class | length | size |
|---|---|---|
| `.len-s` | ≤ 12 chars | `clamp(54px,15vw,74px)` — the prototype's size |
| `.len-m` | ≤ 20 chars | 56px |
| `.len-l` | > 20 chars | 42px |

Measured against the current defaults: 21 of 30 land in `.len-s`/`.len-m`; the longest,
"Roped in, topped out" (20), sits at the bottom of `.len-m`.

### 5.3 Streak bank — 5 fixed milestone slots, admin-editable

`STREAK_CELEBRATE_LINES` becomes a second bank in crew settings, shaped as **five keyed
slots** so each line is written for the moment it lands. The structure is fixed; only
the wording is editable.

| slot | fires at | default |
|---|---|---|
| `d7` | 7 days | Seven days. Knot tied. |
| `d14` | 14 days | Two weeks straight. The rope holds. |
| `d21` | 21 days | Three weeks. That's a habit now. |
| `d28` | 28 days | Four weeks straight. Cast in stone. |
| `beyond` | every 7 days past 28 | `{n}` days straight. Still climbing. |

- `{n}` is an optional token, substituted with the day count. Only `beyond` needs it,
  but any slot may use it. It is the **only** token — no general templating.
- Resolver `streakLine(n)` mirrors `affirmations()`: crew value if set and non-blank,
  else the default for that slot. A blank slot falls back rather than showing empty.
- No bag, no rotation — these are static by design.
- Same 30-char soft ceiling and the same auto-sizing as the affirmations; these lines
  are longer, so most will land in `.len-l`.

**UI:** a second admin card, `#streak-card`, directly under `#affirm-card`, revealed by
the same `tryAdminCode()` call. Five labelled single-line inputs (`7 days`, `14 days`,
`21 days`, `28 days`, `Beyond 28 days`) — not a textarea, because the count is fixed
and each row means a specific thing. One "Restore defaults", one save, matching the
affirmation card's `btn-disc` pattern exactly.

**Storage:** `state.settings.streakLines = { d7, d14, d21, d28, beyond }`, saved through
the same `saveSettings` call, crew-wide like the affirmations. No schema change —
`settings` is already jsonb and the adapters pass it through opaquely.

### 5.4 Not changing

Admin lock, crew-wide storage, dedupe, blank-line stripping, 40-line cap, "Restore
defaults", and add/edit/remove on the main bank (a one-line-per-row textarea already
gives all three) — all correct as built.

---

## 6. Verification (browse is banned — this is the whole plan)

1. `npm test` — existing 29/29 plus new pure tests for `decideCelebrations()` and the
   bag picker. No DOM needed; this is why §4.1 exists.
2. **Timeline harness** (node, no browser): parse the `<style>` block and assert —
   - CSS brace balance across the block (this has broken twice before)
   - every `@keyframes` referenced, every reference defined, no orphans
   - **no `both` on any animation with a non-zero delay** (the "bright ring parked in
     the sky" bug, `INTEGRATION.md`)
   - every multi-stop move carries per-keyframe `animation-timing-function`
   - the ember's landing time == the camera's rest time (they are locked)
   - only one summit light animates as visible in any overlapping window
3. DOM nesting assertion: `.shake` wraps `.cam`, `.whiteout` sibling of `.title`,
   shockwaves inside `.burst`, `.rise`/`.drop` carry travel and their children carry
   sway (the separate-wrappers rule).
4. `node --check` on `app.js` / `logic.js`.
5. Every new `$("id")` cross-checked by hand against a real `id=` attribute in
   `index.html` — the `menu-wrap` crash class. Non-negotiable.
6. **You watch it on the phone.** Pacing, flash intensity, and whether the camera kick
   reads as impact or as a glitch are not verifiable by any of the above.

---

## 7. Risks

- **`design/` is gitignored**, so the prototype, its checkpoint and both these docs are
  untracked and exist on this machine only. Integration is what retires that risk —
  once the sequence lives in `index.html`/`style.css`/`app.js` it is tracked. Until
  then, one `git clean` loses it.
- The watermark code (Option A's target) is three days old and cost a full session of
  CSS traps. Option B does not go near it.
- Nothing is committed since `cc2a650`; publishing is still blocked on Supabase and
  `config.js`. This work adds to that pile — it does not unblock it.

---

## 8. Decisions — all settled 2026-08-11

| # | decision | chosen |
|---|---|---|
| 1 | Stage | **Self-contained overlay**, matched to `.app-peak` geometry (§1) |
| 2 | Length | **Tiered** — ~6.5s target, 12.8s streak, streak supersedes when both land (§3) |
| 3 | Affirmations | **Shuffled bag**, admin keeps add/edit/remove (§5.1) |
| 4 | Headline | **Auto-sized by length**, generous cap kept (§5.2) |
| 5 | Streak lines | **5 fixed admin-editable milestone slots** + `{n}` token (§5.3) |

## 8a. STATUS — phase 1 done, phase 2 HELD

**Phase 1 complete 2026-08-11.** `logic.js` +108/−0 (purely additive): `decideCelebrations`,
`nextFromBag`, `streakLine`, `streakSlotFor`, `STREAK_SLOTS`, `STREAK_DEFAULTS`, plus
`tests/celebration.test.js`. `npm test` 57/57. App runtime unchanged — nothing calls any
of it yet. Baseline snapshot `.foreman/baseline-celebration-20260811-2051/`, ledger
section in `.foreman/ledger.md`.

**Phase 2 is HELD by the owner** pending a concurrent session that merges Home and Crew.

### Why the hold is structural, not just politeness

Phase 2's write set is `app.js` + `index.html` + `style.css`. The Home/Crew merge owns
the same three files, and the tree is uncommitted with no branch isolation. Two sessions
editing `app.js` concurrently is the disjoint-write-set rule being broken outright — the
loser's edits get silently reverted by whoever writes last. **Do not start phase 2 until
that merge has landed.**

### Re-check list before phase 2 resumes

Round 2 of the design council (`council/council-report-achievements-20260811-2101.html`)
carries owner decisions that invalidate parts of this document:

1. **Quick-log chips are CUT.** `homeQuickAdd()` is one of the two call sites of
   `maybeCelebrateTargetMet`. Re-derive which commit paths survive before wiring
   `decideCelebrations` in — §4.1's caller contract assumes two.
2. **Crew becomes the first tab and Home merges into it.** §4.5's file list and any
   assumption about which screen is behind the overlay need re-reading against the
   merged code.
3. **A third celebration kind is now plausible.** Ten achievements are being designed.
   `decideCelebrations` already returns an array specifically so a third kind does not
   change the shape — but decide deliberately whether an achievement unlock gets the
   overlay at all, or only the "wear" mark on the avatar the council recommended.
4. **The excuse-debt model changes `dayState`,** which `streak()` consumes, which feeds
   `decideCelebrations`. If debt ships with an effective-from date, verify the streak
   input is still what this document assumes.
5. **Achievements will also append to `logic.js`,** where phase 1 just appended. Expect
   to reconcile.

### OPEN QUESTION for the owner — the streak celebration itself

The council refused streak-length *achievements*, on this reasoning: `streak()` counts
`met` **or** `rest`, but an **excuse breaks it**. So any reward keyed to streak length
puts a price on writing the post-it — the same failure the +30 penalty was rejected for,
by a quieter route.

The 7-day streak celebration was an explicit owner request, and a transient overlay is a
materially weaker incentive than a persistent crew-visible badge, so this is not
automatically fatal. But it is the same mechanism the council just ruled against. Three
honest options:

- **(a) Ship as designed** — accept the tension; the celebration is a moment, not a status.
- **(b) Count the excuse** — celebrate a streak of `met`/`rest`/`excused` days, so writing
  the post-it costs nothing. Needs a second streak function; `streak()` stays untouched
  for every existing caller.
- **(c) Drop the streak celebration** and let the achievements carry the milestone work.

**Do not pick silently.**

## 9. Build sequence

Ordered so each step is verifiable before the next one lands on top of it, and so the
riskiest thing (the sequence itself) sits on foundations already proven.

1. **Pure logic first.** `decideCelebrations()`, `nextFromBag()`, `streakLine()` into
   `logic.js` + tests. No UI. `npm test` green before anything visual moves.
2. **Copy plumbing.** Descriptor queue, the two title slots, headline sizing, `--flare`
   from the profile colour — driven into the *existing* overlay. At this point the old
   short sequence still plays, but with the new copy system behind it. Verifiable.
3. **The streak bank + its admin card.** Independent of the animation entirely; can be
   checked on the phone on its own.
4. **The sequence.** Replace the `.cel-*` markup and CSS with the factored full take,
   plus the short cut. Timeline harness (§6) written alongside, not after.
5. **Reduced-motion cut** (§4.4) — last, so it's written against the finished timeline.

Steps 1–3 are safe to land without seeing them render. Step 4 is the one that needs
your eyes on a real phone; the local server is `python3 serve-dev.py 8899`.
