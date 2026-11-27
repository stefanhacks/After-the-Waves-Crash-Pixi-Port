// The challenges' control (m6-plan owner decision 1): swipe (the gestures) or the compass pad. Swipe by default on a
// touch screen, the pad otherwise; persisted like mute and "reduce flashes". Pure TypeScript with no Pixi import, so it
// runs under `node --test`. Written by Claude Code.
import type { ControlsMode } from "./input/router-core.ts";

export const CONTROLS_STORAGE_KEY = "after-the-waves-crash.controls.mode";

/** The stored choice, or null for none (missing, corrupt, from another version): then the device decides. */
export const parseControlsMode = (raw: string | null): ControlsMode | null =>
  raw === "swipe" || raw === "pad" ? raw : null;

/** The part of `Storage` the setting uses. */
export type ControlsStorage = Pick<Storage, "getItem" | "setItem">;

export interface ControlsSetting {
  readonly mode: ControlsMode;
  /** Flips the setting and stores it; returns the new value. */
  readonly toggle: () => ControlsMode;
}

/**
 * `storage` is read once, now, and written on each toggle; a throw (storage blocked) keeps the value it had. Without a
 * stored choice, `coarse` (a touch screen is the main pointer) picks swipe.
 */
export const createControlsSetting = (
  coarse: boolean,
  storage: () => ControlsStorage = () => window.localStorage,
): ControlsSetting => {
  let stored: ControlsMode | null = null;

  try {
    stored = parseControlsMode(storage().getItem(CONTROLS_STORAGE_KEY));
  } catch {
    // Storage blocked (privacy mode, sandboxed iframe): the device's default.
  }

  let mode: ControlsMode = stored ?? (coarse ? "swipe" : "pad");

  return {
    get mode() {
      return mode;
    },
    toggle: () => {
      mode = mode === "swipe" ? "pad" : "swipe";

      try {
        storage().setItem(CONTROLS_STORAGE_KEY, mode);
      } catch {
        // Storage blocked or full: the choice lasts for this session only.
      }

      return mode;
    },
  };
};
