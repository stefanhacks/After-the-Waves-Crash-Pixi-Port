// The controls toggle's view (m6-plan owner decision 1): drawn with Graphics in the ui layer (CSS px), below the
// "reduce flashes" toggle and above the endless-mode icon. Swipe mode shows a fingertip with its stroke, pad mode a
// small cross. It only draws: the input router hit-tests the same rect (input/corner-geometry.ts) before the control
// zones. Shown from the gate on, like mute; hidden while the layout has no room for it. Written by Claude Code.
import { Container, Graphics } from "pixi.js";
import type { Layout } from "../core/layout.ts";
import { ICON_COLOR, iconGrid } from "./corner-icon.ts";
import { cornerButtonRect } from "./input/corner-geometry.ts";
import type { ControlsMode } from "./input/router-core.ts";

export interface ControlsButtonView {
  /** Follows a new layout. Call it from onLayout. */
  readonly setLayout: (layout: Layout) => void;
  /** The icon of the mode in use. Idempotent. */
  readonly setMode: (mode: ControlsMode) => void;
  readonly graphics: Graphics;
}

/** The pad's cross on the icon's 24-unit grid: four arms around an empty centre, as [x, y, width, height]. */
const CROSS = [[9, 3, 6, 6], [3, 9, 6, 6], [15, 9, 6, 6], [9, 15, 6, 6]] as const;

export const createControlsButton = (parent: Container): ControlsButtonView => {
  const graphics = new Graphics({ label: "controls-button", eventMode: "none" });
  let layout: Layout | null = null;
  let mode: ControlsMode = "pad";

  const draw = () => {
    graphics.clear();

    const rect = layout === null ? null : cornerButtonRect(layout, "controls");

    graphics.visible = rect !== null;

    if (layout === null || rect === null) {
      return;
    }

    const { at, unit, width } = iconGrid(layout, rect);

    if (mode === "pad") {
      for (const [x, y, w, h] of CROSS) {
        const [left, top] = at(x, y);
        const [right, bottom] = at(x + w, y + h);

        graphics.rect(left, top, right - left, bottom - top).stroke({ width, color: ICON_COLOR, alignment: 1 });
      }

      return;
    }

    // A fingertip at the bottom left and its stroke up to the right, ending in an arrowhead.
    const [cx, cy] = at(7, 17);
    const [x0, y0] = at(10, 14);
    const [x1, y1] = at(19, 5);

    graphics.circle(cx, cy, 3.5 * unit).fill({ color: ICON_COLOR });
    graphics.moveTo(x0, y0).lineTo(x1, y1).stroke({ width, color: ICON_COLOR, cap: "round" });
    graphics.poly([...at(20, 4), ...at(13, 5), ...at(19, 11)]).fill({ color: ICON_COLOR });
  };

  parent.addChild(graphics);

  return {
    setLayout: (next) => {
      layout = next;
      draw();
    },
    setMode: (next) => {
      if (next !== mode) {
        mode = next;
        draw();
      }
    },
    graphics,
  };
};
