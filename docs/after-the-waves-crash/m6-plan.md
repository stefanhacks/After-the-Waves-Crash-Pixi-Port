# M6 Touch-native gestures: plan

Milestone M6 from [04-implementation-difficulty.md](04-implementation-difficulty.md): gesture recognition for the three challenges, using the set designed in [03-new-mechanics.md](03-new-mechanics.md) (Chart the Course, Brace the Helm, Haul the Line). Planned against the code on `main` (`550d8be`). Written by Claude Code. **Status:** draft, waiting on the owner questions at the end.

## What exists today

- **Input** (`src/game/input/`): DOM listeners on the canvas (`dom-router.ts`) feed `router-core.ts`, which hit-tests corner buttons, then the pads, and hands a direction (or null) to `PointerMap` on `pointerdown`. There is **no `pointermove` listener**: a pointer is bound to the direction it went down on until it lifts.
- **Events:** `press(dir)`, `release(dir)`, `cancel`, `advance`, `endless`. The states drain them in `update`, after the clock ticks, and `applyChallengeInput` (`states/common.ts`) forwards the first three to the rule.
- **Rules** (`src/game/challenges/`): `SequenceRule`, `HoldRule`, `ManyRule`, each a small state machine fed `press`/`release`/`cancelAll`; `TimedChallenge` wraps any of them for endless mode. They never see pointers or coordinates.
- **Layout:** the control zones (one bottom zone in portrait, two side bands in landscape) already have the 24 px edge exclusion cut out (`core/layout.ts`), which 03 asks of the gesture surface.
- **E2E:** `e2e/game.ts` already drives touch through CDP `Input.dispatchTouchEvent`, which supports `touchMove`, so drags can be tested without new tooling.

### Where the code and 03 disagree

1. **Sequence, wrong input equal to step 0.** 03 says it advances to step 1. The code (`sequence.ts`) resets to 0 and needs step 0 again, by a later owner decision. **This plan follows the code.**
2. **Chart's two timeouts** (stall about 1 s, lift grace about 1 s). The rule's existing timeout (1 s after the last correct input) already covers both: a finger that stalls or lifts and gives no notch within 1 s resets. This plan **uses the existing timeout only** (see question 3).
3. **Brace pauses** when the thumb slides back inside the threshold (03 owner decision 2). `HoldRule` has no pause: a release resets it. It needs a change (deliverable 3).

## Approach

**Recognisers translate pointer movement into the events the rules already understand.** Each mechanic is a pure-TypeScript recogniser fed `{ id, x, y }` samples in #game CSS px. It emits `press(dir)` (and, for Brace, one new event), so `SequenceRule` and `ManyRule` stay unchanged, `HoldRule` gets one addition, and `TimedChallenge`, pause, `beginEpoch` and endless mode keep working as they are.

| Challenge | Recogniser | Emits | Pointer policy | Needs the heading? |
|---|---|---|---|---|
| Sequence | **Chart:** relative drag; one notch (about 36 px) along the dominant axis, with the minor axis under 0.6 × notch, commits a heading. The origin re-zeroes after each commit; drift on the minor axis re-zeroes it too. | `press(dir)` per notch | **One** active pointer; others are ignored (keeps the mash exploit closed, 04 correction 7) | No |
| Hold | **Brace:** the offset from the touch-down point is past about 36 px and within ±45° of a direction | `press(dir)` on entering a sector, **`ease(dir)`** on sliding back inside the threshold or into another sector, `release(dir)` on lift or cancel | One active pointer | No (sectors) |
| Many | **Haul:** only travel along the heading's axis, in the heading's direction, counts; every D px (about 44 px) is one knot. Return and cross strokes count for nothing. | `press(heading)` per knot | **Several** pointers, each counted on its own | **Yes** |

Why `press` per notch/knot: the rules already count presses, time them on the game clock and shake on misses, so the recognisers stay distance-only (no timestamps) and all timing stays in one place.

**Haul and misses:** Haul never emits another direction, so it never shakes the arrows. A return stroke is part of hauling, and shaking on it would fire every stroke.

## Deliverables

### 1. Pointer movement in the router

- `dom-router.ts`: add a `pointermove` listener on the canvas (same `AbortController` signal), forwarding `pointerId, x, y` for pointers the core tracks. Touch is captured implicitly, and mouse is already captured with `setPointerCapture`, so moves outside the canvas still arrive.
- `router-core.ts`: a **control mode**, set by the states the way `setPauseInput` is:
  - `"pad"`: today's behaviour.
  - `{ gesture: "chart" | "brace" | "haul", heading: Direction | null }`: a pointer that goes down inside a control zone (not on a corner button) goes to the active recogniser instead of the pad hit-test.
  - Corner buttons keep priority, and a gesture pointer's `pointerup` still queues `advance` and runs the activation hooks, so audio unlock and the touch `touchend` fallback keep working.
- `beginEpoch` and `cancelAll` also reset the recogniser, so a pointer that went down before the challenge appeared is ignored (03 shared rule) and a hidden page lets go of everything.
- **Not used:** `getCoalescedEvents`. Recognisers only need distance, so the plain move stream is enough, and Safari's support for it is recent.

### 2. Recognisers (`src/game/input/gestures/`)

- `chart.ts`, `brace.ts`, `haul.ts`: classes or factories with `down(id, x, y)`, `move(id, x, y)`, `up(id)`, `cancel(id)`, `reset()`, each calling an `emit(event)` callback that goes into `PointerMap`'s queue.
- `PointerMap` gets a small public `enqueue` for gesture events (it already has `queueEndless` for the same reason), so the overflow safety net and the event order stay in one place.
- Tunables in `challenges/tuning.ts`, next to the rule timings: `notchPx`, `chartDriftRatio`, `braceThresholdPx`, `braceHalfAngleDeg`, `knotPx`.

### 3. Brace's pause (`HoldRule`)

- New event `ease(dir)`: the lean on `dir` stopped but the finger is still down. Added to `InputEvent` and to `applyChallengeInput`; `SequenceRule` and `ManyRule` ignore it.
- `HoldRule` keeps the **accumulated** hold time instead of one start time. `press` resumes the timer with the time still missing; `ease` stops it and keeps the progress; `release`, `cancelAll` and `reset` still reset to 0.
- `HoldProgress` gains `leaning: boolean`, so the ring can show paused versus filling. `fraction` freezes while eased.
- The keyboard and the pad never send `ease`, so their behaviour is unchanged.

### 4. States

- `round.ts` and `endless.ts` already call `pad.setHint(...)` in `showChallenge`. Next to it, set the control mode from the spec: `chart` for a Sequence, `brace` for a Hold, `haul` with the heading for a Many. Back to `"pad"` (or off) when the round is won, on exit, and while paused.
- The keyboard keeps feeding the same `PointerMap` in every mode, so desktop is unchanged.

### 5. Feedback (scene)

From 03, drawn with Pixi `Graphics` inside the pixel render texture:

- **Chart:** the next node lights per notch, and a wake line grows behind the boat. A wrong notch pulses the vignette (not lightning: the 3 flashes/s budget).
- **Brace:** a ring around the heading arrow fills while `leaning`, and dims while eased. The boat tilts against the gust.
- **Haul:** a 10-pip meter made of cursors, an `ArrowMany` burst per knot, and a faster boat bob.
- **The control zone** needs an affordance once the pad is gone: a faint animated drag hint (a ghost stroke toward the heading for Brace and Haul, a generic "drag" mark for Chart). See question 2.
- SFX: `haul_tick` per knot, the same tick at another `playbackRate` per notch, `creak_loop` while leaning. All on the UI channel. These placeholders haven't been checked by ear yet.

### 6. Assists

- **Latch** (Hold): tap the matching direction once, and the ring fills by itself; tap again to cancel.
- **Steady haul** (Many): the window doubles to 6 s.
- **All Hands** (Many fallback, only if playtests show fatigue): the heading side of the zone becomes one drum target.
- These depend on how the pad and gestures coexist (question 1), so they come last.

### 7. Debug and tuning

- Extend `window.debug` with the gesture tunables and a live readout of the active recogniser (origin, offset, sector, distance to the next notch or knot), so device sessions on the deploy preview can tune without a rebuild. A `?gestures=` launch option (next to `launch-options.ts`) can override the tunables from the URL.

### 8. Tests

- **Unit** (`node --test`), recognisers fed synthetic `{id, x, y}` streams:
  - Chart: a straight drag of 3 notches gives 3 presses; a 45° diagonal gives none; slow drift re-zeroes; a second finger is ignored; ↑ × 9 in a short zone never runs out of room.
  - Brace: the threshold and sector edges (exactly 45°), slide back gives `ease`, crossing to another sector gives `ease` then a wrong `press`, lift gives `release`.
  - Haul: return strokes count nothing; two fingers count separately; cross-axis travel counts nothing.
- `HoldRule`: pause and resume add up to exactly `holdMs`; `ease` then `release` resets; `TimedChallenge` around a paused Hold.
- `router-core`: corner buttons still win over the gesture zone; a gesture pointer's up still advances and activates; `beginEpoch` makes a down-before-the-challenge pointer stale.
- **E2E:** one spec, `e2e/gestures.spec.ts`, using `touchMove` through the existing CDP touch helper: one challenge of each kind on iPhone 13 and Pixel 7, plus a `pointercancel` mid-Brace. A full gesture playthrough is `@slow`.

## Order of work

1. Router movement, control mode and the recogniser interface (deliverables 1 and 2, Brace first). Brace proves the move stream and the cancel paths.
2. `HoldRule` pause, Brace's ring and the states' wiring (3, 4, part of 5).
3. Haul, then Chart, each with its feedback.
4. Debug tunables, then the assists.
5. Device pass on the deploy preview (iPhone and Android, both orientations), then the full `npm run e2e`.

## Risks

- **Landscape bands** may be too narrow for Chart's relative drag and Haul's strokes (about 176–220 px wide). The relative drag in Chart helps; Haul may need a smaller D in landscape.
- **iOS edge swipe-back** can still start inside the zone when a drag ends near the edge; it arrives as `pointercancel` (already handled).
- **Discoverability:** gestures are invisible until taught. Without a hint, a first-time player in round 1 can't know to drag.
- **Real tuning values** (notch, threshold, knot) can only come from devices; the starting values in 03 are estimates.

## Owner questions

1. **Pad and gestures together.** The pad fires on `pointerdown`, so a touch can't be both a pad tap and the start of a drag without delaying every pad tap until the finger moves or lifts. I recommend a **"controls: swipe / pad" corner toggle**, defaulting to swipe on touch screens (`(pointer: coarse)`) and stored in `localStorage` like mute. The pad then disappears from the zone in swipe mode. This also decides how Latch is triggered (03 has it on the pad button). Alternatives: hybrid with a tap/drag slop (adds latency to every tap), or gestures only on touch with no pad at all.
2. **Teaching the gestures.** A ghost-stroke hint the first time each challenge kind appears (once per game, or until the player succeeds once)? Or a line of text under the prompt ("drag ↑")?
3. **Chart's timeout.** Keep the single 1 s timeout after the last correct notch (covers both stall and lift), or build 03's separate stall and lift-grace timers?
4. **Brace with a wrong sector.** When the finger crosses into another direction's sector, should the arrows shake (a wrong `press`, as the pad does), or stay quiet?
5. **Endless mode.** Same gestures there, or keep the pad for endless, where the time limits shrink to about 0.35 s per arrow?
