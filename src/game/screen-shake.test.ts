import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createScreenShake, DIM_ALPHA, SHAKE_ART_PX, SHAKE_MS } from "./screen-shake.ts";

const setup = (reduced = false) => {
  const log: string[] = [];
  const shake = createScreenShake(
    { setOffset: (x) => log.push(`x ${x}`), setAlpha: (alpha) => log.push(`a ${alpha}`) },
    () => 2,
    () => reduced,
  );

  return { shake, log };
};

describe("screen shake", () => {
  it("swings the square and puts it back once the shake is over", () => {
    const { shake, log } = setup();

    shake.shake(1000);
    shake.sync(1050);
    shake.sync(1000 + SHAKE_MS);
    shake.sync(2000);
    assert.deepEqual(log, [`x ${SHAKE_ART_PX * 2}`, "x 0", "a 1"]);
  });

  it("ignores a shake asked for while one runs, so a finger dithering on a sector edge can't keep it going", () => {
    const { shake, log } = setup();

    shake.shake(0);
    shake.shake(200);
    shake.sync(SHAKE_MS);
    assert.deepEqual(log, ["x 0", "a 1"], "over at 300, not 500");
    shake.shake(SHAKE_MS);
    shake.sync(SHAKE_MS + 100);
    assert.equal(log.length, 3);
  });

  it("dims instead of moving under reduced motion", () => {
    const { shake, log } = setup(true);

    shake.shake(0);
    shake.sync(80);
    assert.deepEqual(log, [`a ${DIM_ALPHA}`]);
  });
});
