// Chart the Course (Sequence, 03 and m6-plan): a relative drag, one heading per notch. Pure TypeScript. Written by
// Claude Code.
import type { Direction } from "../../direction.ts";
import type { Emit, Recogniser, TuningSource } from "./gesture.ts";

/**
 * - One active pointer: the first to go down. Others are ignored until it lifts, which keeps the mash exploit closed
 *   (04, correction 7).
 * - Every `notchPx` of travel along the larger axis, from the origin, emits `press(dir)`, while the other axis stays
 *   under `chartDriftRatio` × notch. After a commit the origin moves on by the notches committed along that axis and
 *   follows the finger on the other, so the drag is relative, like a trackpad: ↑ × 9 never runs out of room. A move
 *   that covers several notches at once commits each.
 * - Drift: once the other axis reaches its limit before a commit, the drag is too diagonal to read; the origin
 *   re-zeroes at the finger, so the next notch is measured afresh instead of being blocked for good.
 * - No release, no ease: the Sequence ignores them. Its own 1 s timeout covers a stalled or lifted finger (owner
 *   decision 3).
 */
export const createChart = (emit: Emit, tuning: TuningSource): Recogniser => {
  let active: number | null = null;
  let originX = 0;
  let originY = 0;

  const letGo = (id: number) => {
    if (id === active) {
      active = null;
    }
  };

  return {
    down: (id, x, y) => {
      if (active === null) {
        active = id;
        originX = x;
        originY = y;
      }
    },
    move: (id, x, y) => {
      if (id !== active) {
        return;
      }

      const { chartDriftRatio } = tuning();
      // At least 1 px, so a bad debug value can't loop forever.
      const notchPx = Math.max(1, tuning().notchPx);
      const dx = x - originX;
      const dy = y - originY;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const major = horizontal ? dx : dy;
      const minor = horizontal ? dy : dx;

      if (Math.abs(minor) >= chartDriftRatio * notchPx) {
        originX = x;
        originY = y;
        return;
      }

      const notches = Math.floor(Math.abs(major) / notchPx);

      if (notches === 0) {
        return;
      }

      const step = Math.sign(major) * notches * notchPx;
      const dir: Direction = horizontal ? (major < 0 ? "left" : "right") : major < 0 ? "up" : "down";

      if (horizontal) {
        originX += step;
        originY = y;
      } else {
        originY += step;
        originX = x;
      }

      for (let notch = 0; notch < notches; notch++) {
        emit({ kind: "press", dir });
      }
    },
    up: letGo,
    cancel: letGo,
    letGoAll: () => {
      active = null;
    },
    reset: () => {
      active = null;
    },
    inspect: () => ({ kind: "chart", active, origin: active === null ? null : { x: originX, y: originY } }),
  };
};
