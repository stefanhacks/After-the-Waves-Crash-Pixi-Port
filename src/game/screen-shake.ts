// The screen shake (m6-plan owner decision 4): Brace's finger entering a wrong sector shakes the whole playfield, where
// a wrong key shakes only the arrows. The square swings sideways and dies out over 0.3 s, as the arrow shake does
// (arrow-row.ts ARROW_SHAKE); under reduced motion it dims instead, without moving. On the game clock, so it freezes
// with a pause. Pure TypeScript with no Pixi import. Written by Claude Code.

/** How long a shake (or dim) runs, in game ms. A shake asked for while one runs is ignored: no endless shaking. */
export const SHAKE_MS = 300;

/** The swing, in playfield art px (scaled to CSS px by the layout), as ARROW_SHAKE's ±3 with a little more weight. */
export const SHAKE_ART_PX = 4;

/** The dim's lowest alpha under reduced motion. */
export const DIM_ALPHA = 0.6;

// The swing's keys: [ms, share of SHAKE_ART_PX], linear between them.
const SWING: readonly (readonly [number, number])[] = [
  [0, 0], [50, 1], [100, -1], [150, 0.67], [200, -0.67], [250, 0.33], [300, 0],
];

const lerpKeys = (keys: readonly (readonly [number, number])[], at: number) => {
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];

    if (at <= t1) {
      const [t0, v0] = keys[i - 1];

      return v0 + ((v1 - v0) * (at - t0)) / (t1 - t0);
    }
  }

  return 0;
};

/** The square's sideways offset (share of SHAKE_ART_PX) `at` ms into a shake; 0 outside it. */
export const swingAt = (at: number) => (at <= 0 || at >= SHAKE_MS ? 0 : lerpKeys(SWING, at));

/** The square's alpha `at` ms into a reduced-motion dim: down to DIM_ALPHA at 80 ms, back to 1 at the end. */
export const dimAt = (at: number) =>
  at <= 0 || at >= SHAKE_MS ? 1 : lerpKeys([[0, 1], [80, DIM_ALPHA], [SHAKE_MS, 1]], at);

/** What the shake moves: the shown square (core/display.ts) and its alpha. */
export interface ShakeTarget {
  setOffset(x: number): void;
  setAlpha(alpha: number): void;
}

export interface ScreenShake {
  /** Starts a shake at game time `now`, unless one is running. */
  shake(now: number): void;
  /** Applies the shake at game time `now`. Once a frame; cheap when idle. */
  sync(now: number): void;
}

/** `scale` is the layout's CSS px per art px; `reducedMotion` is read when a shake starts. */
export const createScreenShake = (
  target: ShakeTarget,
  scale: () => number,
  reducedMotion: () => boolean,
): ScreenShake => {
  let startedAt: number | null = null;
  let dim = false;

  return {
    shake: (now) => {
      if (startedAt !== null && now - startedAt < SHAKE_MS) {
        return;
      }

      startedAt = now;
      dim = reducedMotion();
    },
    sync: (now) => {
      if (startedAt === null) {
        return;
      }

      const at = now - startedAt;

      if (at >= SHAKE_MS) {
        startedAt = null;
        target.setOffset(0);
        target.setAlpha(1);
        return;
      }

      if (dim) {
        target.setAlpha(dimAt(at));
      } else {
        target.setOffset(swingAt(at) * SHAKE_ART_PX * scale());
      }
    },
  };
};
