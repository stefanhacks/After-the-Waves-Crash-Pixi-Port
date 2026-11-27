// Haul the Line (Many, 03 and m6-plan): repeated strokes along the heading, one knot per `knotPx` of rope. Pure
// TypeScript. Written by Claude Code.
import type { Direction } from "../../direction.ts";
import { UNIT, type Emit, type Recogniser, type TuningSource } from "./gesture.ts";

interface Rope {
  /** The pointer's last position projected on the heading's axis. */
  along: number;
  /** Rope pulled toward the next knot. */
  pulled: number;
}

/**
 * - Several pointers, each with its own rope (03: several fingers count).
 * - Only travel along the heading's axis counts; cross-axis travel projects to nothing. Travel toward the heading adds
 *   to the rope, travel back takes from it, never below 0: a return stroke counts for nothing, and a finger resting
 *   on the glass can't creep a knot out of its jitter.
 * - Every `knotPx` pulled emits `press(heading)`, and the rope starts on the next knot. Nothing else is ever emitted,
 *   so hauling never shakes the arrows.
 */
export const createHaul = (heading: Direction, emit: Emit, tuning: TuningSource): Recogniser => {
  const ropes = new Map<number, Rope>();
  const unit = UNIT[heading];
  const project = (x: number, y: number) => x * unit.x + y * unit.y;

  return {
    down: (id, x, y) => {
      ropes.set(id, { along: project(x, y), pulled: 0 });
    },
    move: (id, x, y) => {
      const rope = ropes.get(id);

      if (rope === undefined) {
        return;
      }

      const along = project(x, y);
      // At least 1 px, so a bad debug value can't loop forever.
      const knotPx = Math.max(1, tuning().knotPx);

      rope.pulled = Math.max(0, rope.pulled + along - rope.along);
      rope.along = along;

      while (rope.pulled >= knotPx) {
        rope.pulled -= knotPx;
        emit({ kind: "press", dir: heading });
      }
    },
    up: (id) => {
      ropes.delete(id);
    },
    cancel: (id) => {
      ropes.delete(id);
    },
    letGoAll: () => ropes.clear(),
    reset: () => ropes.clear(),
    leaning: false,
    inspect: () => ({
      kind: "haul",
      heading,
      ropes: [...ropes.entries()].map(([id, rope]) => ({ id, pulled: Math.round(rope.pulled) })),
    }),
  };
};
