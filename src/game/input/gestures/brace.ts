// Brace the Helm (Hold, 03 and m6-plan): drag toward the heading and stay there. Pure TypeScript. Written by Claude
// Code.
import type { Direction } from "../../direction.ts";
import { dominant, UNIT, type Emit, type Recogniser, type TuningSource } from "./gesture.ts";

/** Where the finger leans: inside the threshold (or between sectors), on the heading, or on another direction. */
type Lean = { readonly on: "none" } | { readonly on: "heading" } | { readonly on: "other"; readonly dir: Direction };

/**
 * - One active pointer: the first to go down. The lean is its offset from where it went down.
 * - Past `braceThresholdPx`, and within `braceHalfAngleDeg` of a direction's axis, the finger leans on that direction.
 * - Entering the heading's lean emits `press(heading)`: the Hold starts, or resumes from a pause.
 * - Leaving it, back inside the threshold or into another sector, emits `ease(heading)`: the Hold pauses (03 owner
 *   decision 2, kept in m6-plan).
 * - Entering another direction's sector emits `stray`, once per entry: the screen shakes (m6-plan owner decision 4).
 * - Lifting or a cancel emits `release(heading)` if the finger ever leant on the heading: the Hold resets. The finger
 *   must stay down until the ring is full.
 */
export const createBrace = (heading: Direction, emit: Emit, tuning: TuningSource): Recogniser => {
  let active: number | null = null;
  let originX = 0;
  let originY = 0;
  let lean: Lean = { on: "none" };
  // Whether the active pointer has pressed the heading, so its lift must release it.
  let pressed = false;

  const leanAt = (x: number, y: number): Lean => {
    const { braceThresholdPx, braceHalfAngleDeg } = tuning();
    const dx = x - originX;
    const dy = y - originY;
    const distance = Math.hypot(dx, dy);

    if (distance < braceThresholdPx) {
      return { on: "none" };
    }

    const dir = dominant(dx, dy);
    const unit = UNIT[dir];
    // The angle off the direction's axis, from the dot product with its unit vector.
    const offAxis = Math.acos(Math.min(1, (dx * unit.x + dy * unit.y) / distance)) * (180 / Math.PI);

    // The epsilon keeps an exact 45° inside at the default (acos rounds it up a hair).
    if (offAxis > braceHalfAngleDeg + 1e-9) {
      return { on: "none" };
    }

    return dir === heading ? { on: "heading" } : { on: "other", dir };
  };

  const letGo = (id: number) => {
    if (id !== active) {
      return;
    }

    active = null;
    lean = { on: "none" };

    if (pressed) {
      pressed = false;
      emit({ kind: "release", dir: heading });
    }
  };

  return {
    down: (id, x, y) => {
      if (active === null) {
        active = id;
        originX = x;
        originY = y;
        lean = { on: "none" };
        pressed = false;
      }
    },
    move: (id, x, y) => {
      if (id !== active) {
        return;
      }

      const next = leanAt(x, y);
      const same = next.on === lean.on && (next.on !== "other" || (lean.on === "other" && lean.dir === next.dir));

      if (same) {
        return;
      }

      if (lean.on === "heading") {
        emit({ kind: "ease", dir: heading });
      }

      lean = next;

      if (next.on === "heading") {
        pressed = true;
        emit({ kind: "press", dir: heading });
      } else if (next.on === "other") {
        emit({ kind: "stray" });
      }
    },
    up: letGo,
    cancel: letGo,
    letGoAll: () => {
      if (active !== null) {
        letGo(active);
      }
    },
    reset: () => {
      active = null;
      lean = { on: "none" };
      pressed = false;
    },
    inspect: () => ({
      kind: "brace",
      heading,
      active,
      origin: active === null ? null : { x: originX, y: originY },
      lean: lean.on === "other" ? lean.dir : lean.on,
    }),
  };
};
