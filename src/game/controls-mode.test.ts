import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTROLS_STORAGE_KEY, createControlsSetting } from "./controls-mode.ts";

const memory = (initial: string | null = null) => {
  const items = new Map<string, string>();

  if (initial !== null) {
    items.set(CONTROLS_STORAGE_KEY, initial);
  }

  return {
    items,
    storage: () => ({
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        items.set(key, value);
      },
    }),
  };
};

describe("controls setting", () => {
  it("defaults to swipe on a touch screen and the pad otherwise, without a stored choice", () => {
    assert.equal(createControlsSetting(true, memory().storage).mode, "swipe");
    assert.equal(createControlsSetting(false, memory().storage).mode, "pad");
    assert.equal(createControlsSetting(true, memory("corrupt").storage).mode, "swipe");
  });

  it("keeps a stored choice over the device's default, and stores each toggle", () => {
    const { items, storage } = memory("pad");
    const setting = createControlsSetting(true, storage);

    assert.equal(setting.mode, "pad");
    assert.equal(setting.toggle(), "swipe");
    assert.equal(items.get(CONTROLS_STORAGE_KEY), "swipe");
  });

  it("works with storage blocked, for the session only", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    const setting = createControlsSetting(true, blocked);

    assert.equal(setting.mode, "swipe");
    assert.equal(setting.toggle(), "pad");
    assert.equal(setting.mode, "pad");
  });
});
