// Haul the Line (Many, 03 and m6-plan): strokes along the heading, each worth several presses, counted when the finger
// lifts. Pure TypeScript. Written by Claude Code.
import type { Direction } from "../../direction.ts";
import { UNIT, type Emit, type Recogniser, type TuningSource } from "./gesture.ts";

/**
 * - Each finger is its own stroke, from where it went down to where it lifts (owner request: a stroke counts on
 *   release, like Chart's swipe).
 * - A correct stroke travelled at least `haulStrokePx` toward the heading, and its sideways travel is at most
 *   `swipeSlantRatio` of that. On its lift it emits `haulPressesPerStroke` presses of the heading at once (owner
 *   request: more than one per stroke, so 10 presses take a few strokes, not 10 in 3 s).
 * - Any other stroke (too short, slanted, toward another direction) counts for nothing and emits nothing, so hauling
 *   never shakes the arrows. A cancelled finger counts for nothing.
 * - Several fingers may haul at once, each its own stroke (03: several fingers count).
 */
export const createHaul = (heading: Direction, emit: Emit, tuning: TuningSource): Recogniser => {
  const strokes = new Map<number, { readonly fromX: number; readonly fromY: number; x: number; y: number }>();
  const unit = UNIT[heading];

  return {
    down: (id, x, y) => {
      strokes.set(id, { fromX: x, fromY: y, x, y });
    },
    move: (id, x, y) => {
      const stroke = strokes.get(id);

      if (stroke !== undefined) {
        stroke.x = x;
        stroke.y = y;
      }
    },
    up: (id) => {
      const stroke = strokes.get(id);

      if (stroke === undefined) {
        return;
      }

      strokes.delete(id);

      const { haulStrokePx, haulPressesPerStroke, swipeSlantRatio } = tuning();
      const dx = stroke.x - stroke.fromX;
      const dy = stroke.y - stroke.fromY;
      // Travel toward the heading, and sideways from its axis.
      const along = dx * unit.x + dy * unit.y;
      const across = Math.abs(dx * unit.y - dy * unit.x);

      if (along < haulStrokePx || across > swipeSlantRatio * along) {
        return;
      }

      for (let press = 0; press < haulPressesPerStroke; press++) {
        emit({ kind: "press", dir: heading });
      }
    },
    cancel: (id) => {
      strokes.delete(id);
    },
    letGoAll: () => strokes.clear(),
    reset: () => strokes.clear(),
    leaning: false,
    inspect: () => ({
      kind: "haul",
      heading,
      strokes: [...strokes.entries()].map(([id, stroke]) => ({
        id,
        dx: Math.round(stroke.x - stroke.fromX),
        dy: Math.round(stroke.y - stroke.fromY),
      })),
    }),
  };
};
