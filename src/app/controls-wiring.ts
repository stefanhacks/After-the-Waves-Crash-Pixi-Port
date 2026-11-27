// Swipe mode (m6-plan): the controls toggle, the pad shown only in pad mode, the gesture of each challenge, the ghost
// stroke and the screen shake. The states see it as their pad (`pad`) and their challenge controls (`controls`).
// Written by Claude Code.
import type { AudioEngine, UiLoop } from "../core/audio/audio-engine.ts";
import { snapToDevicePixels } from "../core/layout.ts";
import type { PlayfieldDisplay } from "../core/display.ts";
import type { ChallengeSpec } from "../game/challenges/rule.ts";
import type { ControlsButtonView } from "../game/controls-button.ts";
import { createControlsSetting, type ControlsSetting } from "../game/controls-mode.ts";
import type { GestureHintView } from "../game/gesture-hint.ts";
import type { InputRouter } from "../game/input/dom-router.ts";
import type { GestureControl } from "../game/input/router-core.ts";
import type { PadView } from "../game/pad-view.ts";
import { watchReducedMotion } from "../game/scene/lightning.ts";
import { createScreenShake } from "../game/screen-shake.ts";
import type { ChallengeControls, PadControl } from "../game/states/types.ts";
import type { LayoutBus } from "./layout-bus.ts";

/** The gesture a challenge needs (m6-plan): Chart for a Sequence, Brace for a Hold, Haul for a Many. */
export const gestureFor = (spec: ChallengeSpec | null): GestureControl | null => {
  if (spec === null) {
    return null;
  }

  return spec.kind === "sequence"
    ? { kind: "chart" }
    : { kind: spec.kind === "hold" ? "brace" : "haul", heading: spec.direction };
};

/** Chart's swipe tick: the haul tick, played higher (03, New assets needed). */
const SWIPE_TICK_RATE = 1.5;

/** Whether a touch screen is the main pointer: swipe mode's default. */
const coarsePointer = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export interface ControlsWiring {
  readonly router: InputRouter;
  readonly padView: PadView;
  readonly gestureHint: GestureHintView;
  readonly controlsButton: Pick<ControlsButtonView, "setMode">;
  readonly display: PlayfieldDisplay;
  readonly layouts: LayoutBus;
  readonly clock: { readonly now: number };
  readonly audio: Pick<AudioEngine, "playUi" | "loopUi">;
  /** Read once; a unit test passes its own. */
  readonly setting?: ControlsSetting;
}

export const wireControls = ({
  router, padView, gestureHint, controlsButton, display, layouts, clock, audio,
  setting = createControlsSetting(coarsePointer()),
}: ControlsWiring) => {
  // What the states asked for, kept so a toggle can apply the other mode to it.
  let padWanted = false;
  let challenge: ChallengeSpec | null = null;
  // The gesture sounds (03, UI channel): a tick per Haul stroke, the same tick higher per Chart swipe, the creak
  // while leaning.
  let ticked = router.gesturePresses;
  let creak: UiLoop | null = null;

  const syncSounds = () => {
    const counted = router.gesturePresses - ticked;

    ticked = router.gesturePresses;

    // One tick per frame with a count: a Haul stroke's presses land together, and stacked clicks would only be louder.
    if (counted > 0 && challenge?.kind === "many") {
      audio.playUi("haulTick");
    } else if (counted > 0 && challenge?.kind === "sequence") {
      audio.playUi("haulTick", { rate: SWIPE_TICK_RATE });
    }

    if (router.gestureLeaning && creak === null) {
      creak = audio.loopUi("creakLoop");
    } else if (!router.gestureLeaning && creak !== null) {
      creak.stop();
      creak = null;
    }
  };

  const shake = createScreenShake(
    {
      setOffset: (x) => display.setOffset(snapToDevicePixels(x, layouts.current.dpr)),
      setAlpha: (alpha) => {
        display.sprite.alpha = alpha;
      },
    },
    () => layouts.current.scale,
    watchReducedMotion(),
  );

  const applyMode = () => {
    router.setControls(setting.mode);
    controlsButton.setMode(setting.mode);
    padView.setVisible(padWanted && setting.mode === "pad");
  };

  const showChallenge = () => {
    router.setGesture(gestureFor(challenge));
    gestureHint.setChallenge(challenge, setting.mode === "swipe", router.gesturePresses);
  };

  applyMode();
  router.onControls(() => {
    setting.toggle();
    applyMode();
    showChallenge();
  });

  const pad: PadControl = {
    setVisible: (visible) => {
      padWanted = visible;
      padView.setVisible(visible && setting.mode === "pad");
    },
    setDimmed: (dimmed) => padView.setDimmed(dimmed),
    setHint: (dir) => padView.setHint(dir),
  };

  const controls: ChallengeControls = {
    setChallenge: (spec) => {
      challenge = spec;
      showChallenge();
    },
    shakeScreen: () => shake.shake(clock.now),
  };

  return {
    pad,
    controls,
    get mode() {
      return setting.mode;
    },
    /** A new game or endless run: every challenge kind gets its ghost stroke again. */
    newGame: () => gestureHint.newGame(),
    /** The shake and the ghost at game time `now`. Once a frame, in the game logic. */
    sync: (now: number) => {
      shake.sync(now);
      gestureHint.sync(now, router.gesturePresses);
      syncSounds();
    },
  };
};
