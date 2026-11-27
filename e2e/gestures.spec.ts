// Swipe mode (m6-plan): the gestures in the real page, through CDP touches on the iPhone project. The recognisers'
// rules are unit-tested (src/game/input/gestures/); this checks the wiring: the router's move stream, the toggle, the
// pad hidden, the ghost stroke and a cancel mid-Brace. Written by Claude Code.
import { expect, test, type Page } from "@playwright/test";
import {
  FAST,
  isPadVisible,
  leaveTitle,
  openGame,
  playRound,
  readGame,
  readStory,
  setTimescale,
  swipeDriver,
  useControls,
  waitFor,
} from "./game.ts";

test.describe.configure({ timeout: 90_000 });

// Game logic, not pixels: DPR 1 keeps the software-rendered frames cheap (as playthrough.spec.ts does).
test.use({ deviceScaleFactor: 1 });

const readGestures = (page: Page) => page.evaluate(() => {
  const { gestures } = window.debug;

  return { controls: gestures.controls, active: gestures.active, presses: gestures.presses, hint: gestures.hint };
});

/** Opens the game in swipe mode and plays up to round 0's first challenge. */
const toRound = async (page: Page) => {
  await useControls(page, "swipe");
  await openGame(page);

  const driver = await swipeDriver(page);

  await leaveTitle(page, driver);
  await readStory(page, driver);
  await waitFor(page, (game) => game.state === "round" && game.challenge !== null);

  return driver;
};

test("plays round 0 with swipes: Chart and Brace, the pad hidden, the ghost stroke until the first swipe", {
  tag: ["@touch", "@slow"],
}, async ({ page }) => {
  const driver = await toRound(page);

  expect(await isPadVisible(page)).toBe(false);
  expect(await readGestures(page)).toMatchObject({ controls: "swipe", active: true, presses: 0 });

  const first = (await readGame(page)).challenge?.spec;

  expect(first?.kind).toBe("sequence");
  await expect.poll(async () => (await readGestures(page)).hint).toBe(true);

  if (first?.kind === "sequence") {
    // One swipe: the ghost goes, and the Sequence moves on.
    await setTimescale(page, 0.25);
    await driver.tapAll(first.directions.slice(0, 1));
    await expect.poll(async () => (await readGestures(page)).hint).toBe(false);
    await setTimescale(page, FAST);
  }

  await playRound(page, driver, { expectPad: false });
  expect((await readGame(page)).part).toBe(1);
});

test("hauls round 1's Many", { tag: ["@touch", "@slow"] }, async ({ page }) => {
  const driver = await toRound(page);

  await playRound(page, driver, { expectPad: false });
  await readStory(page, driver);
  await waitFor(page, (game) => game.state === "round" && game.challenge !== null);
  // Round 1 always holds one Many (TUNING).
  await playRound(page, driver, { expectPad: false });
  expect((await readGame(page)).part).toBe(2);
});

test("a cancelled touch mid-Brace resets the Hold", { tag: "@touch" }, async ({ page }) => {
  const driver = await toRound(page);

  // Round 0's challenges until its Hold.
  while ((await readGame(page)).challenge?.spec.kind !== "hold") {
    const { spec } = (await readGame(page)).challenge ?? {};

    if (spec?.kind !== "sequence") {
      throw new Error("round 0 is Sequences and one Hold");
    }

    const index = (await readGame(page)).challenge?.index;

    await setTimescale(page, 0.25);
    await driver.tapAll(spec.directions);
    await waitFor(page, (game) => game.challenge?.index !== index);
  }

  const spec = (await readGame(page)).challenge?.spec;

  if (spec?.kind !== "hold") {
    throw new Error("no Hold");
  }

  await setTimescale(page, 1);
  await driver.press(spec.direction);
  await waitFor(page, (game) => game.challenge?.progress.kind === "hold" && game.challenge.progress.leaning);
  await driver.cancel();
  await waitFor(page, (game) => game.challenge?.progress.kind === "hold" && !game.challenge.progress.held);
});

test("the controls button switches between swipe and the pad, and the choice is kept", {
  tag: "@touch",
}, async ({ page }) => {
  await toRound(page);

  const rect = await page.evaluate(() => window.debug.router.controlsRect);

  if (rect === null) {
    throw new Error("no controls button");
  }

  await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await expect.poll(async () => (await readGestures(page)).controls).toBe("pad");
  expect(await isPadVisible(page)).toBe(true);
  expect((await readGestures(page)).active).toBe(false);
  expect(await page.evaluate(() => window.localStorage.getItem("after-the-waves-crash.controls.mode"))).toBe("pad");
});
