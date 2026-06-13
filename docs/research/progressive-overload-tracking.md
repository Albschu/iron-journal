# Tracking Progressive Overload — Research & Design Note

*Research note for Iron Journal — last updated 2026-06-13*

## Goal

You want a **tracker + improvement** layer that **checks whether *you* are
progressing yourself**, and *nudges* you — instead of the app silently adding
weight to your workouts.

This is a deliberate shift from Iron Journal's current behaviour. Today
`AppStore.applyProgression(from:)` (`AppStore.swift:87`) **automatically
increments the target weight** after a successful session. The design below
keeps the data model but moves from *"the app overloads for you"* to *"the app
watches and coaches you."*

---

## 1. What progressive overload actually is

Progressive overload = gradually increasing training stress over time. You can
overload along several axes, in rough priority order for a tracker:

1. **Weight** — heavier load for the same reps
2. **Reps** — more reps at the same load
3. **Sets** — more working sets (more volume)
4. **Density / tempo** — less rest, slower eccentrics (harder to track, skip for v1)

The widely recommended practical scheme is **double progression**:

> Pick a rep *range* (e.g. 8–12). Add **reps** each session until you hit the top
> of the range on all working sets, *then* add **weight** and drop back to the
> bottom of the range. Repeat.

Source guidance: add weight when you hit the **top of your rep range for 2
consecutive sessions** with good form (confirms it wasn't a fluke); progress in
small steps (1 rep/week or ~1.25–2.5 kg increments).

## 2. The key idea: one objective "progress signal"

To *check whether you progressed*, the tracker needs a single number that goes
up when you do **more weight OR more reps**. The standard tool is **estimated
1RM (e1RM)** via the **Epley formula**:

```
e1RM = weight × (1 + reps / 30)
```

- 100 kg × 5 reps → e1RM ≈ 116.7
- 100 kg × 6 reps → e1RM ≈ 120.0  (more reps = progress ✔)
- 102.5 kg × 5 reps → e1RM ≈ 119.6 (more weight = progress ✔)

Use the **best working set** of the session as that exercise's e1RM for the day.
Epley is accurate for ~2–12 reps (best at 6–10) — ideal for this app. This lets
the tracker recognise *any* form of overload, not just heavier plates.

(Iron Journal already tracks `topWeight` and `volume` per `LoggedExercise` —
e1RM is one more derived metric in the same spirit and a better single progress
signal than raw weight, because raw weight ignores rep PRs.)

## 3. Detection logic — per-exercise status

Compare each exercise's recent sessions (the data is already available via
`AppStore.history(for:)`). Derive a **status** per exercise:

| Status | Rule of thumb | Message to user |
|--------|---------------|-----------------|
| 🟢 **Progressing** | Best e1RM (or volume) > previous session | "Nice — up X kg/reps vs. last time." |
| 🟡 **Maintaining** | Within noise of last session (±1 small step) | "Holding steady. Try +1 rep next time." |
| 🔵 **Ready to add weight** | Hit **top of rep range** on all working sets, 2 sessions running | "You've maxed the rep range — add +{increment} kg next session." |
| 🟠 **Stalled / Plateau** | No e1RM improvement for **≥3 sessions** | "Stalled 3 sessions. Consider a deload or rep/tempo change." |
| ⚪ **Deload suggested** | Stalled and/or 4–6 weeks of hard training without a break | "Time for a lighter week (−~50% volume), then push again." |

Notes:
- **One bad session is not a plateau** — require ≥3 sessions of no progress so
  normal day-to-day variation doesn't trigger false alarms.
- "No progress" should be judged on e1RM/volume, not raw weight, so rep PRs count.

## 4. The "checker, not auto-adder" change

This is the core of your request. Concretely:

- **Stop mutating targets automatically.** Replace the auto-increment in
  `applyProgression` with a **suggestion** that you *accept or dismiss*. The app
  detects "you earned a weight bump" and shows the 🔵 *Ready to add weight* badge
  + a one-tap "Apply +2.5 kg" button — but the weight only changes if **you**
  tap it.
- **Add a feature flag** (e.g. `autoProgression: Bool` per exercise, default
  `false`) so the old behaviour stays available for anyone who wants it. Your
  preference becomes the default: the app *checks*, you *decide*.
- The existing `hasPendingIncrease(_:)` already computes a related signal; it
  would be repurposed/renamed to drive the *suggestion*, not reflect an
  already-applied auto-bump.

## 5. Mapping to Iron Journal's models

Minimal additions (kept local-JSON, no new dependencies):

- **`SetTarget`**: add an optional rep **range** for double progression —
  `repRangeMin: Int?`, `repRangeMax: Int?` (fall back to the single `reps` as
  both the floor and the target when unset, so existing data still works).
- **`Exercise`**: add `autoProgression: Bool = false` (the flag above).
- **Derived, no storage needed** (compute from existing `sessions`):
  - `e1RM` on `LoggedExercise`/`LoggedSet` (Epley) — add to `Models.swift`
    alongside `volume`/`topWeight`.
  - A `progressionStatus(for: exerciseId)` function on `AppStore` that returns
    one of the statuses in §3, plus a human-readable message.
- **`SeedData` / persistence**: new fields are additive and optional, so old
  `routines.json` / `sessions.json` decode fine (Swift `Codable` tolerates
  missing keys when defaults exist).

## 6. UI: an "Improvement" surface

Two complementary placements (the second is the new part you asked for):

1. **Inline badge** on `ActiveSessionView` / `WorkoutListView`: show the
   per-exercise status pill (🟢/🟡/🔵/🟠) so you see *as you train* whether
   you're beating last time, and get the one-tap "Apply +X kg" when earned.
2. **New "Verbesserung / Improvement" tab** (sibling of Dashboard): a list of
   all exercises sorted by "needs attention" — stalled lifts first, then
   ready-to-increase, then progressing. Each row: trend sparkline of e1RM, the
   status message, last-session-vs-previous delta, and a deload hint when due.

This turns logging into *review* — the research is blunt that "logging is
useless if you never look at the data; spend ~5 min/week reviewing progress."

## 7. Suggested build order

1. Add `e1RM` (Epley) to `Models.swift` + unit tests in `IronJournalTests`.
2. Add `progressionStatus(for:)` to `AppStore` (pure function over `history`).
3. Convert auto-progression → opt-in `autoProgression` flag; show suggestion +
   one-tap apply instead of silent mutation.
4. Add the status badge to the active-session / workout views.
5. Add the **Improvement** tab.
6. (Optional) rep-range / double-progression fields + deload scheduling.

---

## Sources

- [Progressive Overload: A Beginner's Guide to Tracking (Hevy)](https://www.hevyapp.com/progressive-overload/)
- [Progressive Overload: The Science of Building Muscle — double progression, plateaus, deload (Arvo)](https://arvo.guru/resources/progressive-overload)
- [Progressive Overload Explained: How to Track It (Push/Pull)](https://push-pull.app/blog/progressive-overload-explained)
- [Best Fitness Apps for Tracking Progressive Overload (Jefit)](https://www.jefit.com/wp/guide/slug-introduction-best-fitness-apps-for-tracking-progressive-overload-1-understanding-progressive-overload-2-features-to-look-for-in-fitness-apps-3-top-fitness-apps-reviewed-4-benefits-of-using-a-fit/)
- [Epley Formula — estimating 1RM from weight × reps (Arvo)](https://arvo.guru/resources/epley-formula)
- [The Comprehensive Guide to 1RM Calculators (ICSS)](https://theicss.org/2023/09/04/the-comprehensive-guide-to-1rm-calculators/)
