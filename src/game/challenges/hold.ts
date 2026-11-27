// Hold ("... hold strong ..."): hold one arrow for `holdMs`. Pure TypeScript with no Pixi import.
import type { TimerHandle } from "../../core/clock.ts";
import type { Direction } from "../direction.ts";
import type { ChallengeRule, HoldProgress, RuleContext } from "./rule.ts";

/**
 * Rules (01 and 02, and Brace's pause from 03 and m6-plan):
 * - A press of the direction starts the hold; it completes once held for `holdMs` of game time (a timer, so it
 *   completes without any further input).
 * - Its release, or `cancelAll`, resets it. Other directions don't affect it, pressed or released; a press of one calls
 *   `context.onMiss` (the arrows shake).
 * - `ease` of the direction pauses a running hold and keeps the time held so far; the next press of the direction
 *   resumes it with the time still missing. Only Brace sends it, so pad and keyboard holds never pause.
 * - Only a press received by this rule starts a hold: a direction already held when the challenge began does not
 *   count until it is pressed again. A second press while running keeps the running hold.
 */
export class HoldRule implements ChallengeRule {
  readonly spec: { readonly kind: "hold"; readonly direction: Direction };
  private readonly context: RuleContext;
  /** Game time the hold has run before the current run, while held. */
  private heldMs = 0;
  /** When the current run started; undefined while not held or paused. */
  private runningSince: number | undefined;
  private held = false;
  private timer: TimerHandle | undefined;
  private finished = false;

  constructor(direction: Direction, context: RuleContext) {
    this.spec = { kind: "hold", direction };
    this.context = context;
  }

  get done(): boolean {
    return this.finished;
  }

  get progress(): HoldProgress {
    if (this.finished) {
      return { kind: "hold", held: false, leaning: false, fraction: 1 };
    }

    if (!this.held) {
      return { kind: "hold", held: false, leaning: false, fraction: 0 };
    }

    const fraction = this.elapsedMs() / this.context.tuning.holdMs;

    return {
      kind: "hold",
      held: true,
      leaning: this.runningSince !== undefined,
      fraction: Math.min(1, Math.max(0, fraction)),
    };
  }

  press(dir: Direction): void {
    if (this.finished) {
      return;
    }

    if (dir !== this.spec.direction) {
      // A wrong key: the arrows shake. A running hold of the right direction goes on.
      this.context.onMiss?.();
      return;
    }

    if (this.runningSince !== undefined) {
      return;
    }

    this.held = true;
    this.runningSince = this.context.now();
    this.timer = this.context.scope.after(this.context.tuning.holdMs - this.heldMs, () => {
      this.timer = undefined;
      this.clear();
      this.finished = true;
      this.context.onDone?.();
    });
  }

  ease(dir: Direction): void {
    if (this.finished || dir !== this.spec.direction || this.runningSince === undefined) {
      return;
    }

    this.heldMs = this.elapsedMs();
    this.runningSince = undefined;
    this.stopTimer();
  }

  release(dir: Direction): void {
    if (dir === this.spec.direction) {
      this.reset();
    }
  }

  cancelAll(): void {
    this.reset();
  }

  reset(): void {
    if (this.finished || !this.held) {
      return;
    }

    this.stopTimer();
    this.clear();
  }

  private elapsedMs(): number {
    return this.heldMs + (this.runningSince === undefined ? 0 : this.context.now() - this.runningSince);
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      this.context.scope.cancel(this.timer);
      this.timer = undefined;
    }
  }

  private clear(): void {
    this.held = false;
    this.heldMs = 0;
    this.runningSince = undefined;
  }
}
