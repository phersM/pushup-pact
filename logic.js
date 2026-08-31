// Rope & Rung — pure logic core. No DOM, no network. Imported by app.js and tests.

// ---- dates (all date-only strings "YYYY-MM-DD", local time) ----

export function toDayStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function parseDay(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return toDayStr(d);
}

export function daysBetween(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000);
}

// Monday of the week containing day s (rest-day windows are Mon–Sun)
export function weekStart(s) {
  const d = parseDay(s);
  const shift = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(s, -shift);
}

// ---- settings ----

export const DEFAULT_SETTINGS = {
  target_start: 70,
  target_step: 10,
  step_every: "week",
  target_cap: 200,
  rest_days_per_week: 1,
  challenge_start: "2026-07-20", // Monday of launch week; editable in-app
};

// target(date) = min(start + step * whole weeks since challenge_start, cap)
export function targetFor(day, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const days = daysBetween(s.challenge_start, day);
  if (days < 0) return s.target_start;
  const weeks = Math.floor(days / 7);
  return Math.min(s.target_start + s.target_step * weeks, s.target_cap);
}

// ---- tallies ----

export function dayTally(sets, profileId, day) {
  return sets
    .filter((x) => x.profile_id === profileId && x.day === day)
    .reduce((sum, x) => sum + x.reps, 0);
}

export function allTimeTotal(sets, profileId) {
  return sets.filter((x) => x.profile_id === profileId).reduce((s, x) => s + x.reps, 0);
}

export function isLate(set) {
  // "logged late" tag: the set was recorded on a different calendar date than
  // its day — in the USER'S timezone. logged_at is a UTC ISO string, so it
  // must be converted to a local day before comparing; slicing the raw string
  // flagged every pre-morning log as late east of Greenwich (owner-reported:
  // an 8:50am AEST log has yesterday's UTC date).
  return set.logged_at ? toDayStr(new Date(set.logged_at)) !== set.day : false;
}

// ---- rest days ----

export function restsUsedInWeek(statuses, profileId, day) {
  const start = weekStart(day);
  const end = addDays(start, 6);
  return statuses.filter(
    (st) => st.profile_id === profileId && st.kind === "rest" && st.day >= start && st.day <= end
  ).length;
}

export function canDeclareRest(statuses, profileId, day, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const already = statuses.some((st) => st.profile_id === profileId && st.kind === "rest" && st.day === day);
  if (already) return { ok: false, reason: "already-rest" };
  if (restsUsedInWeek(statuses, profileId, day) >= s.rest_days_per_week)
    return { ok: false, reason: "cap-reached" };
  return { ok: true, remaining: s.rest_days_per_week - restsUsedInWeek(statuses, profileId, day) };
}

// ---- day state ----
// met | rest | excused | missed | pending

export function dayState({ sets, statuses, profileId, day, today, settings = DEFAULT_SETTINGS }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const tally = dayTally(sets, profileId, day);
  const target = targetFor(day, settings);
  const rest = statuses.find((x) => x.profile_id === profileId && x.day === day && x.kind === "rest");
  const excuse = statuses.find((x) => x.profile_id === profileId && x.day === day && x.kind === "excuse");
  if (tally >= target) return { state: "met", tally, target, excuse: excuse?.excuse_text ?? null };
  // warm-up days before the challenge starts are never judged
  if (day < s.challenge_start) return { state: "pending", tally, target, excuse: excuse?.excuse_text ?? null };
  if (rest && restWithinCap(statuses, profileId, day, settings, rest))
    return { state: "rest", tally, target, excuse: null };
  if (excuse) return { state: "excused", tally, target, excuse: excuse.excuse_text ?? "" };
  if (day >= today) return { state: "pending", tally, target, excuse: null };
  return { state: "missed", tally, target, excuse: null };
}

// A declared rest only counts if it is within the first N rests of its Mon–Sun week
function restWithinCap(statuses, profileId, day, settings, restRow) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const start = weekStart(day);
  const end = addDays(start, 6);
  const weekRests = statuses
    .filter((st) => st.profile_id === profileId && st.kind === "rest" && st.day >= start && st.day <= end)
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  return weekRests.indexOf(restRow) < s.rest_days_per_week;
}

// ---- streak ----
// Consecutive days ending yesterday (or today if already met/rest) where state is met or rest.

export function streak({ sets, statuses, profileId, today, settings = DEFAULT_SETTINGS, challengeStart }) {
  const start = challengeStart ?? { ...DEFAULT_SETTINGS, ...settings }.challenge_start;
  let count = 0;
  let day = today;
  const todayState = dayState({ sets, statuses, profileId, day, today, settings }).state;
  if (todayState === "met" || todayState === "rest") count++;
  day = addDays(day, -1);
  while (day >= start) {
    const st = dayState({ sets, statuses, profileId, day, today, settings }).state;
    if (st === "met" || st === "rest") count++;
    else break;
    day = addDays(day, -1);
  }
  return count;
}

// ---- celebrations ----
// Decision only, no DOM/side effects — app.js turns the result into a queue
// of things to show. Kept pure so the "both at once" collapse (see below) is
// a decision the tests can pin, not an accident of firing order.

export function decideCelebrations({ beforeTally, repsAdded, target, streakDays }) {
  // Missing/non-numeric inputs read as 0 rather than throwing or NaN-poisoning
  // the comparisons below.
  const before = Number(beforeTally) || 0;
  const added = Number(repsAdded) || 0;
  const days = Number(streakDays) || 0;
  // A target that isn't a positive finite number means signed-out or
  // pre-challenge state — never celebrate against a target that doesn't
  // really exist.
  if (!(Number.isFinite(target) && target > 0)) return [];
  const crossed = before < target && before + added >= target;
  // 0 % 7 === 0, so without the `days > 0` guard a member with NO streak at
  // all (streakDays 0) would fire a milestone celebration on day zero.
  const milestone = days > 0 && days % 7 === 0;
  // Both landing on the same commit collapses to ONE entry, not two: the
  // streak supersedes, and the affirmation bag must not be drawn from on a
  // day its line is never shown — see nextFromBag's admin-add note below for
  // why a burned line matters.
  if (crossed && milestone) return [{ kind: "streak", cut: "full", days, alsoTarget: true }];
  if (milestone) return [{ kind: "streak", cut: "full", days }];
  if (crossed) return [{ kind: "target", cut: "short" }];
  return [];
}

// ---- affirmation bag ----
// Shuffled-bag picker: every line in the bank is drawn once before any line
// repeats. Replaces a weaker "random, but not equal to last" picker that
// repeated noticeably when fired daily across 30 lines.
//
// Lines the admin ADDS only enter the bag at the next refill — the app
// resets the stored bag explicitly whenever the bank is saved, so this
// function does not need to detect additions itself.
export function nextFromBag(bank, bagState, rng = Math.random) {
  if (!Array.isArray(bank) || bank.length === 0) {
    return { line: null, state: { remaining: [], last: bagState?.last ?? null } };
  }
  const prevLast = bagState && typeof bagState === "object" ? (bagState.last ?? null) : null;
  // A line the admin has since deleted must never be drawn, even if it's
  // still sitting in a bag that was filled before the edit.
  let remaining = (Array.isArray(bagState?.remaining) ? bagState.remaining : []).filter((line) =>
    bank.includes(line)
  );

  if (remaining.length === 0) {
    remaining = shuffleBag(bank, rng);
    // A fresh bag boundary can otherwise deal the same line twice in a row
    // (last line of the old bag == first line of the new one) — swap it away
    // so a shuffle boundary is never visible as a repeat.
    if (remaining[0] === prevLast && remaining.length > 1) {
      const swapIdx = 1 + Math.floor(rng() * (remaining.length - 1));
      [remaining[0], remaining[swapIdx]] = [remaining[swapIdx], remaining[0]];
    }
  }

  remaining = remaining.slice();
  const line = remaining.shift();
  return { line, state: { remaining, last: line } };
}

// Fisher–Yates, driven by the injected rng so tests can pin the sequence.
function shuffleBag(bank, rng) {
  const a = bank.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- streak lines ----
// Five fixed, admin-editable milestone slots. The structure is fixed
// (STREAK_SLOTS, for the admin editor to iterate); only the wording is
// editable per crew.

export const STREAK_SLOTS = ["d7", "d14", "d21", "d28", "beyond"];

export const STREAK_DEFAULTS = {
  d7: "Seven days. Knot tied.",
  d14: "Two weeks straight. The rope holds.",
  d21: "Three weeks. That's a habit now.",
  d28: "Four weeks straight. Cast in stone.",
  beyond: "{n} days straight. Still climbing.",
};

// Which of the five slots a given day-count fires; every milestone past 28
// shares "beyond" rather than growing the slot list forever.
export function streakSlotFor(days) {
  if (days === 7) return "d7";
  if (days === 14) return "d14";
  if (days === 21) return "d21";
  if (days === 28) return "d28";
  return "beyond";
}

export function streakLine(days, lines) {
  const slot = streakSlotFor(days);
  const override = lines && typeof lines === "object" ? lines[slot] : undefined;
  // A blank/whitespace-only override must fall back rather than render an
  // empty celebration headline.
  const text = typeof override === "string" && override.trim() !== "" ? override : STREAK_DEFAULTS[slot];
  return text.replaceAll("{n}", String(days));
}
