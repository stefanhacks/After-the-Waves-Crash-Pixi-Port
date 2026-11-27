// Chart the Course (Sequence, 03 and m6-plan): one swipe, one heading, counted when the finger lifts. Pure TypeScript.
// Written by Claude Code.
import type { Direction } from "../../direction.ts";
import { dominant, type Emit, type Recogniser, type TuningSource } from "./gesture.ts";

/**
 * - Each finger is its own swipe, from where it went down to where it lifts. On the lift it emits one `press(dir)` for
 *   the swipe's larger axis, however long the swipe was (owner request: a swipe counts once, on release).
 * - It counts only if it travelled at least `swipePx`, and its other axis is at most `swipeSlantRatio` of the larger
 *   one: a short or diagonal swipe counts for nothing, rather than guessing a heading (a wrong one resets the
 *   Sequence).
 * - A cancelled finger counts for nothing: the browser took the gesture over.
 * - Several fingers may swipe at once; each lift is one discrete press, in lift order, so mashing can't advance a
 *   Sequence (a wrong heading still resets it).
 * - No release, no ease: the Sequence ignores them. Its own 1 s timeout runs from the last counted swipe.
 */
export const createChart = (emit: Emit, tuning: TuningSource): Recogniser => {
  const swipes = new Map<number, { readonly fromX: number; readonly fromY: number; x: number; y: number }>();

  return {
    down: (id, x, y) => {
      swipes.set(id, { fromX: x, fromY: y, x, y });
    },
    move: (id, x, y) => {
      const swipe = swipes.get(id);

      if (swipe !== undefined) {
        swipe.x = x;
        swipe.y = y;
      }
    },
    up: (id) => {
      const swipe = swipes.get(id);

      if (swipe === undefined) {
        return;
      }

      swipes.delete(id);

      const { swipePx, swipeSlantRatio } = tuning();
      const dx = swipe.x - swipe.fromX;
      const dy = swipe.y - swipe.fromY;
      const major = Math.max(Math.abs(dx), Math.abs(dy));
      const minor = Math.min(Math.abs(dx), Math.abs(dy));

      if (major >= swipePx && minor <= swipeSlantRatio * major) {
        emit({ kind: "press", dir: dominant(dx, dy) satisfies Direction });
      }
    },
    cancel: (id) => {
      swipes.delete(id);
    },
    letGoAll: () => swipes.clear(),
    reset: () => swipes.clear(),
    leaning: false,
    inspect: () => ({
      kind: "chart",
      swipes: [...swipes.entries()].map(([id, swipe]) => ({
        id,
        dx: Math.round(swipe.x - swipe.fromX),
        dy: Math.round(swipe.y - swipe.fromY),
      })),
    }),
  };
};
