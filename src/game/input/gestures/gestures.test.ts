import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GESTURE_TUNING, type GestureTuning } from "../../challenges/tuning.ts";
import { createBrace } from "./brace.ts";
import { createChart } from "./chart.ts";
import type { GestureEvent, Recogniser } from "./gesture.ts";
import { createHaul } from "./haul.ts";

type Make = (emit: (event: GestureEvent) => void, tuning: () => GestureTuning) => Recogniser;

const setup = (make: Make, tuning: GestureTuning = GESTURE_TUNING) => {
  const events: string[] = [];
  const recogniser = make(
    (event) => events.push(event.kind === "stray" ? "stray" : `${event.kind} ${event.dir}`),
    () => tuning,
  );

  /** Moves pointer `id` from its last point to (x, y) in `steps` even samples, as a finger's move stream would. */
  const points = new Map<number, { x: number; y: number }>();
  const down = (id: number, x: number, y: number) => {
    points.set(id, { x, y });
    recogniser.down(id, x, y);
  };
  const drag = (id: number, x: number, y: number, steps = 10) => {
    const from = points.get(id) ?? { x, y };

    for (let step = 1; step <= steps; step++) {
      recogniser.move(id, from.x + ((x - from.x) * step) / steps, from.y + ((y - from.y) * step) / steps);
    }

    points.set(id, { x, y });
  };

  return { recogniser, events, down, drag };
};

describe("Chart (Sequence)", () => {
  const chart: Make = (emit, tuning) => createChart(emit, tuning);

  /** One finger: down at the origin, a drag to (dx, dy), then up. */
  const swipe = (t: ReturnType<typeof setup>, id: number, dx: number, dy: number) => {
    t.down(id, 200, 400);
    t.drag(id, 200 + dx, 400 + dy);
    t.recogniser.up(id);
  };

  it("counts a swipe once, on its lift, however long it is", () => {
    const t = setup(chart);

    t.down(1, 200, 400);
    t.drag(1, 200, 400 - 300, 30);
    assert.deepEqual(t.events, [], "nothing while the finger is down");
    t.recogniser.up(1);
    assert.deepEqual(t.events, ["press up"]);
  });

  it("reads each swipe's larger axis", () => {
    const t = setup(chart);

    swipe(t, 1, 0, -40);
    swipe(t, 2, 50, 10);
    swipe(t, 3, 0, 120);
    swipe(t, 4, -36, 0);
    assert.deepEqual(t.events, ["press up", "press right", "press down", "press left"]);
  });

  it("counts by where the finger lifts, not the path: out and back is no swipe", () => {
    const t = setup(chart);

    t.down(1, 0, 0);
    t.drag(1, 0, -100);
    t.drag(1, 0, -10);
    t.recogniser.up(1);
    assert.deepEqual(t.events, []);
  });

  it("ignores a swipe shorter than swipePx, or too diagonal", () => {
    const t = setup(chart);

    swipe(t, 1, 0, -35);
    swipe(t, 2, 100, 70);
    swipe(t, 3, 100, 100);
    assert.deepEqual(t.events, []);
    swipe(t, 4, 100, 60);
    assert.deepEqual(t.events, ["press right"], "a slant of exactly swipeSlantRatio still counts");
  });

  it("counts several fingers on their own, in lift order", () => {
    const t = setup(chart);

    t.down(1, 0, 0);
    t.down(2, 100, 0);
    t.drag(1, 0, -50);
    t.drag(2, 150, 0);
    t.recogniser.up(2);
    t.recogniser.up(1);
    assert.deepEqual(t.events, ["press right", "press up"]);
  });

  it("counts nothing for a cancelled finger, or one down before a reset or letGoAll", () => {
    for (const end of ["cancel", "reset", "letGoAll"] as const) {
      const t = setup(chart);

      t.down(1, 0, 0);
      t.drag(1, 0, 100);

      if (end === "cancel") {
        t.recogniser.cancel(1);
      } else {
        t.recogniser[end]();
      }

      t.recogniser.up(1);
      assert.deepEqual(t.events, [], end);
    }
  });
});

describe("Brace (Hold)", () => {
  const brace: Make = (emit, tuning) => createBrace("up", emit, tuning);

  it("presses once past the threshold toward the heading, and releases on lift", () => {
    const t = setup(brace);

    t.down(1, 100, 300);
    t.drag(1, 100, 300 - 35);
    assert.deepEqual(t.events, []);
    t.drag(1, 100, 300 - 36);
    t.drag(1, 110, 300 - 120);
    t.recogniser.up(1);
    assert.deepEqual(t.events, ["press up", "release up"]);
  });

  it("eases sliding back inside the threshold and presses again leaning out (the pause)", () => {
    const t = setup(brace);

    t.down(1, 0, 0);
    t.drag(1, 0, -50);
    t.drag(1, 0, -10);
    t.drag(1, 0, -50);
    t.recogniser.cancel(1);
    assert.deepEqual(t.events, ["press up", "ease up", "press up", "release up"]);
  });

  it("strays once per entry into another sector, easing a running lean first", () => {
    const t = setup(brace);

    t.down(1, 0, 0);
    t.drag(1, 0, -50);
    t.drag(1, 50, -10);
    t.drag(1, 60, 5);
    t.drag(1, 0, 50);
    t.drag(1, 0, 0);
    assert.deepEqual(t.events, ["press up", "ease up", "stray", "stray"]);
  });

  it("reads exactly 45° as up/down, like the pad", () => {
    const t = setup(brace);

    t.down(1, 0, 0);
    t.drag(1, 40, -40, 1);
    assert.deepEqual(t.events, ["press up"]);
  });

  it("leaves a gap between sectors with a narrower half-angle", () => {
    const t = setup(brace, { ...GESTURE_TUNING, braceHalfAngleDeg: 30 });

    t.down(1, 0, 0);
    t.drag(1, 40, -40, 1);
    assert.deepEqual(t.events, [], "45° off both axes");
    t.drag(1, 10, -40, 1);
    assert.deepEqual(t.events, ["press up"]);
  });

  it("releases nothing for a finger that never leant on the heading", () => {
    const t = setup(brace);

    t.down(1, 0, 0);
    t.drag(1, 50, 0);
    t.recogniser.up(1);
    assert.deepEqual(t.events, ["stray"]);
  });

  it("lets go on letGoAll (a hidden page), and forgets silently on reset", () => {
    const t = setup(brace);

    t.down(1, 0, 0);
    t.drag(1, 0, -50);
    t.recogniser.letGoAll();
    assert.deepEqual(t.events, ["press up", "release up"]);

    t.down(2, 0, 0);
    t.drag(2, 0, -50);
    t.recogniser.reset();
    t.drag(2, 0, 0);
    t.recogniser.up(2);
    assert.deepEqual(t.events, ["press up", "release up", "press up"]);
  });

  it("follows one pointer only", () => {
    const t = setup(brace);

    t.down(1, 0, 0);
    t.down(2, 0, 0);
    t.drag(2, 0, -50);
    t.recogniser.up(2);
    assert.deepEqual(t.events, []);
  });
});

describe("Haul (Many)", () => {
  const haul: Make = (emit, tuning) => createHaul("down", emit, tuning);

  it("counts a knot per knotPx pulled toward the heading; return strokes count nothing", () => {
    const t = setup(haul);

    t.down(1, 100, 100);

    for (let stroke = 0; stroke < 3; stroke++) {
      t.drag(1, 100, 100 + 100);
      t.drag(1, 100, 100);
    }

    // 100 px a stroke: 2 knots and 12 px over, which the return stroke takes back.
    assert.deepEqual(t.events, Array(6).fill("press down"));
  });

  it("ignores cross-axis travel", () => {
    const t = setup(haul);

    t.down(1, 0, 0);
    t.drag(1, 300, 0);
    t.drag(1, 0, 0);
    assert.deepEqual(t.events, []);
  });

  it("can't creep a knot out of a resting finger's jitter", () => {
    const t = setup(haul);

    t.down(1, 0, 0);

    for (let sample = 0; sample < 200; sample++) {
      t.recogniser.move(1, 0, sample % 2 === 0 ? 1 : -1);
    }

    assert.deepEqual(t.events, []);
  });

  it("counts several fingers on their own ropes", () => {
    const t = setup(haul);

    t.down(1, 0, 0);
    t.down(2, 50, 0);
    t.drag(1, 0, 30);
    t.drag(2, 50, 30);
    assert.deepEqual(t.events, [], "30 px each: no knot yet, even though 60 px were pulled in all");
    t.drag(1, 0, 44);
    t.drag(2, 50, 44);
    assert.deepEqual(t.events, ["press down", "press down"]);
  });

  it("forgets a lifted or cancelled finger, and a finger down before a reset", () => {
    const t = setup(haul);

    t.down(1, 0, 0);
    t.recogniser.up(1);
    t.drag(1, 0, 100);
    t.down(2, 0, 0);
    t.recogniser.cancel(2);
    t.drag(2, 0, 100);
    t.down(3, 0, 0);
    t.recogniser.reset();
    t.drag(3, 0, 100);
    assert.deepEqual(t.events, []);
  });
});
