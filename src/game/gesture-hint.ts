// The ghost stroke (m6-plan owner decision 2): in swipe mode, the first time each challenge kind comes up in a game
// (and in each endless run), a faint fingertip and its trail loop in every control zone, toward the heading (a
// Sequence's first one). It goes at the first counted gesture (a swipe, a lean or a stroke). Under reduced motion it is
// a still stroke. Drawn with Graphics in the ui layer (CSS px), like the pad, on the game clock. Written by Claude
// Code.
import { Container, Graphics } from "pixi.js";
import type { Layout, Point } from "../core/layout.ts";
import type { ChallengeKind, ChallengeSpec } from "./challenges/rule.ts";
import type { Direction } from "./direction.ts";
import { UNIT } from "./input/gestures/gesture.ts";
import { ICON_COLOR } from "./corner-icon.ts";

/** The stroke's length in CSS px: a Chart swipe, about one Haul stroke. */
export const HINT_STROKE_PX = 72;

/** One loop: the fingertip travels for MOVE_MS, waits, then fades out by LOOP_MS. */
export const HINT_MOVE_MS = 900;
export const HINT_LOOP_MS = 1500;

const FINGER_RADIUS = 9;
const TRAIL_WIDTH = 4;
const PEAK_ALPHA = 0.55;

/** Where the fingertip is (share of the stroke, 0..1) and the hint's alpha, `at` ms into its loop. */
export const hintFrame = (at: number, still: boolean) => {
  if (still) {
    return { travel: 1, alpha: PEAK_ALPHA };
  }

  const t = ((at % HINT_LOOP_MS) + HINT_LOOP_MS) % HINT_LOOP_MS;
  // Ease out, as a thumb slows at the end of a stroke.
  const travel = t >= HINT_MOVE_MS ? 1 : 1 - (1 - t / HINT_MOVE_MS) ** 2;
  const fade = t <= HINT_MOVE_MS + 200 ? 1 : 1 - (t - HINT_MOVE_MS - 200) / (HINT_LOOP_MS - HINT_MOVE_MS - 200);

  return { travel, alpha: PEAK_ALPHA * Math.max(0, fade) };
};

/** The direction a spec's ghost shows: a Hold's or Many's heading, a Sequence's first. */
const hintDirection = (spec: ChallengeSpec): Direction =>
  spec.kind === "sequence" ? spec.directions[0] : spec.direction;

export interface GestureHintView {
  readonly setLayout: (layout: Layout) => void;
  /**
   * The challenge up (or null), whether swipe mode is on, and the router's gesture presses so far. Shows the ghost if
   * this kind hasn't had one this game; any other call hides it.
   */
  readonly setChallenge: (spec: ChallengeSpec | null, swipe: boolean, presses: number) => void;
  /** A new game (or endless run): every kind gets its ghost again. */
  readonly newGame: () => void;
  /** Draws the ghost at game time `now`, or hides it once a gesture press counted. Once a frame. */
  readonly sync: (now: number, presses: number) => void;
  /** Whether a ghost is up, for tests and `window.debug`. */
  readonly showing: boolean;
  readonly graphics: Graphics;
}

export const createGestureHint = (parent: Container, reducedMotion: () => boolean): GestureHintView => {
  const graphics = new Graphics({ label: "gesture-hint", eventMode: "none", visible: false });
  const shown = new Set<ChallengeKind>();
  let layout: Layout | null = null;
  let current: { readonly dir: Direction; readonly presses: number; startedAt: number | null } | null = null;

  parent.addChild(graphics);

  const hide = () => {
    current = null;
    graphics.clear();
    graphics.visible = false;
  };

  const draw = (dir: Direction, travel: number, alpha: number) => {
    graphics.clear();

    if (layout === null) {
      return;
    }

    const unit = UNIT[dir];

    for (const zone of layout.zones) {
      if (zone.width <= 0 || zone.height <= 0) {
        continue;
      }

      const centre: Point = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
      const from: Point = { x: centre.x - (unit.x * HINT_STROKE_PX) / 2, y: centre.y - (unit.y * HINT_STROKE_PX) / 2 };
      const tip: Point = {
        x: from.x + unit.x * HINT_STROKE_PX * travel,
        y: from.y + unit.y * HINT_STROKE_PX * travel,
      };

      graphics
        .moveTo(from.x, from.y)
        .lineTo(tip.x, tip.y)
        .stroke({ width: TRAIL_WIDTH, color: ICON_COLOR, alpha: alpha * 0.6, cap: "round" });
      graphics.circle(tip.x, tip.y, FINGER_RADIUS).fill({ color: ICON_COLOR, alpha });
    }
  };

  return {
    setLayout: (next) => {
      layout = next;
    },
    setChallenge: (spec, swipe, presses) => {
      if (spec === null || !swipe || shown.has(spec.kind)) {
        hide();
        return;
      }

      shown.add(spec.kind);
      current = { dir: hintDirection(spec), presses, startedAt: null };
    },
    newGame: () => {
      shown.clear();
      hide();
    },
    sync: (now, presses) => {
      if (current === null) {
        return;
      }

      if (presses > current.presses) {
        hide();
        return;
      }

      current.startedAt ??= now;

      const { travel, alpha } = hintFrame(now - current.startedAt, reducedMotion());

      graphics.visible = true;
      draw(current.dir, travel, alpha);
    },
    get showing() {
      return current !== null;
    },
    graphics,
  };
};
