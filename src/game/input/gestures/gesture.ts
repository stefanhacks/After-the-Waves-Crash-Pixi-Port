// What the gesture recognisers share (m6-plan): the events they emit, their interface and the direction maths. Pure
// TypeScript with no DOM access, so it runs under `node --test`. Coordinates are #game CSS px, y down. Written by
// Claude Code.
import type { GestureTuning } from "../../challenges/tuning.ts";
import type { Direction } from "../../direction.ts";

/**
 * What a recogniser emits into the input queue (pointer-map.ts has the full contract):
 * - `press(dir)`: one committed heading (Chart's swipe, on its lift; Haul's knot), or Brace's lean starting or
 *   resuming.
 * - `ease(dir)`: Brace's lean stopped, the finger still down (the Hold pauses).
 * - `release(dir)`: Brace's finger, which had leant, let go.
 * - `stray`: Brace's finger entered another direction's sector. The states shake the screen; the rule never sees it.
 */
export type GestureEvent =
  | { readonly kind: "press" | "release" | "ease"; readonly dir: Direction }
  | { readonly kind: "stray" };

export type Emit = (event: GestureEvent) => void;

/** The live tunables: read on every move, so a debug change applies at once. */
export type TuningSource = () => GestureTuning;

/**
 * A recogniser for one challenge kind. Ids it never saw go down are ignored, so a pointer that went down before it was
 * made (or before its last `reset`) counts for nothing.
 */
export interface Recogniser {
  down(id: number, x: number, y: number): void;
  move(id: number, x: number, y: number): void;
  /** The pointer lifted. */
  up(id: number): void;
  /** The browser cancelled the pointer: let go like `up`. */
  cancel(id: number): void;
  /** Lets every pointer go as their `up` would (blur, hidden page, a control change), then forgets them. */
  letGoAll(): void;
  /** Forgets every pointer silently (a new state or phase: the queue is dropped anyway). */
  reset(): void;
  /** Whether a finger leans on the heading now (Brace only): the creak loop plays meanwhile. */
  readonly leaning: boolean;
  /** A plain snapshot for `window.debug.gestures`. */
  inspect(): Record<string, unknown>;
}

/** A unit vector per direction, y down. */
export const UNIT: Readonly<Record<Direction, { readonly x: number; readonly y: number }>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** The direction of an offset by its larger axis; an exact diagonal goes to up/down, as the pad's hit-test does. */
export const dominant = (dx: number, dy: number): Direction => {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? "left" : "right";
  }

  return dy < 0 ? "up" : "down";
};
