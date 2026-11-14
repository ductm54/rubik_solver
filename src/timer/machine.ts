/**
 * Timer state machine (pure: the caller passes timestamps), WCA style:
 *
 *   idle ──press/release──▶ inspecting (15 s countdown; +2 after 15 s, DNF after 17 s)
 *   inspecting ──press──▶ holding ──held ≥ holdMs──▶ ready ──release──▶ running
 *   running ──press──▶ stopped (result emitted) ──release──▶ idle
 *
 * With inspection off, idle ──press──▶ holding directly. Releasing before `ready` goes back to
 * the previous state (a false start does not start the clock). Cancel returns to idle.
 */
import type { Penalty } from './stats';

export type TimerState = 'idle' | 'inspecting' | 'holding' | 'ready' | 'running' | 'stopped';

export interface TimerResult {
  time: number;
  penalty: Penalty;
}

export interface TimerOptions {
  inspection?: boolean;
  /** How long to hold before the timer is ready (WCA stackmat ≈ 0.55 s; csTimer default 0.3 s). */
  holdMs?: number;
}

export const INSPECTION_MS = 15000;
export const DNF_AFTER_MS = 17000;

export class TimerMachine {
  state: TimerState = 'idle';
  private inspectStart = 0;
  private holdStart = 0;
  private runStart = 0;
  private inspectionPenalty: Penalty = 'none';
  /** Whether holding started from inspection (to return to it on a false start). */
  private holdFromInspection = false;
  lastResult: TimerResult | null = null;
  opts: Required<TimerOptions>;

  constructor(opts: TimerOptions = {}) {
    this.opts = { inspection: true, holdMs: 300, ...opts };
  }

  /** Key / touch down. Returns a result when this press stops the timer. */
  press(t: number): TimerResult | null {
    switch (this.state) {
      case 'idle':
        if (this.opts.inspection) {
          // inspection starts on release of this press
          this.state = 'idle';
          this.pendingInspection = true;
        } else {
          this.startHolding(t, false);
        }
        return null;
      case 'inspecting':
        this.startHolding(t, true);
        return null;
      case 'running': {
        const time = t - this.runStart;
        this.state = 'stopped';
        this.lastResult = { time, penalty: this.inspectionPenalty };
        return this.lastResult;
      }
      default:
        return null;
    }
  }

  private pendingInspection = false;

  /** Key / touch up. */
  release(t: number): void {
    switch (this.state) {
      case 'idle':
        if (this.pendingInspection) {
          this.pendingInspection = false;
          this.state = 'inspecting';
          this.inspectStart = t;
          this.inspectionPenalty = 'none';
        }
        return;
      case 'holding':
        // false start: not held long enough
        this.state = this.holdFromInspection ? 'inspecting' : 'idle';
        return;
      case 'ready':
        this.inspectionPenalty = this.holdFromInspection ? this.penaltyAt(t) : 'none';
        if (this.inspectionPenalty === 'DNF') {
          this.state = 'stopped';
          this.lastResult = { time: 0, penalty: 'DNF' };
          return;
        }
        this.state = 'running';
        this.runStart = t;
        return;
      case 'stopped':
        this.state = 'idle';
        return;
      default:
    }
  }

  /** Call every frame: promotes holding → ready, and reports inspection overrun. */
  tick(t: number): void {
    if (this.state === 'holding' && t - this.holdStart >= this.opts.holdMs) this.state = 'ready';
  }

  cancel(): void {
    this.state = 'idle';
    this.pendingInspection = false;
  }

  /** Milliseconds on the main display: solve time while running, else last result. */
  elapsed(t: number): number {
    if (this.state === 'running') return t - this.runStart;
    return this.lastResult?.time ?? 0;
  }

  /** Inspection time used so far (ms). */
  inspectionElapsed(t: number): number {
    return t - this.inspectStart;
  }

  /** Penalty if the solve started at time t. */
  penaltyAt(t: number): Penalty {
    const used = t - this.inspectStart;
    if (used > DNF_AFTER_MS) return 'DNF';
    if (used > INSPECTION_MS) return '+2';
    return 'none';
  }

  private startHolding(t: number, fromInspection: boolean) {
    this.state = 'holding';
    this.holdStart = t;
    this.holdFromInspection = fromInspection;
  }
}
