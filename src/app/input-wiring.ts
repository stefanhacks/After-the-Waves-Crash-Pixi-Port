// Input: the router (DOM listeners on the canvas, the keyboard and page visibility, queued for the states to drain)
// and the pad view, both following the layout. Written by Claude Code.
import type { Layout } from "../core/layout.ts";
import { createInputRouter } from "../game/input/dom-router.ts";
import { computePads } from "../game/input/pad-geometry.ts";
import { createGestureHint } from "../game/gesture-hint.ts";
import { createPadView } from "../game/pad-view.ts";
import { watchReducedMotion } from "../game/scene/lightning.ts";
import type { LayoutBus } from "./layout-bus.ts";
import type { Stage } from "./stage.ts";

export const wireInput = (
  { app, gameElement, layers }: Pick<Stage, "app" | "gameElement" | "layers">,
  layouts: LayoutBus,
) => {
  // Its `visibilitychange` listener is added here, before page-lifecycle.ts adds main's (see there).
  const router = createInputRouter(app.canvas, gameElement);
  const padView = createPadView(layers.ui);
  // Swipe mode's ghost stroke goes where the pad would be, in the same place in the ui layer's order.
  const gestureHint = createGestureHint(layers.ui, watchReducedMotion());

  layouts.follow((next: Layout) => {
    router.setLayout(next);
    padView.setPads(computePads(next), next.dpr);
    gestureHint.setLayout(next);
  });

  return { router, padView, gestureHint };
};
