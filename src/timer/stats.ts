/** Solve records and WCA-style statistics. */

export type Penalty = 'none' | '+2' | 'DNF';

export interface Solve {
  id: string;
  /** Raw timer reading in milliseconds (without penalty). */
  time: number;
  penalty: Penalty;
  /** Scramble in WCA notation (white top, green front). */
  scramble: string;
  /** Epoch milliseconds when the solve finished. */
  date: number;
  note?: string;
  /** Where the scramble came from. */
  source?: 'random' | 'scan' | 'manual' | 'import';
}

/** Time that counts, in ms; DNF is +Infinity. */
export function effective(s: Pick<Solve, 'time' | 'penalty'>): number {
  if (s.penalty === 'DNF') return Infinity;
  return s.penalty === '+2' ? s.time + 2000 : s.time;
}

/** 12.34 · 1:02.34 · DNF. Truncated to hundredths like WCA timers. */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms)) return 'DNF';
  const cs = Math.floor(ms / 10);
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor((cs % 6000) / 100);
  const hundredths = cs % 100;
  const sec = `${seconds}.${String(hundredths).padStart(2, '0')}`;
  return minutes ? `${minutes}:${sec.padStart(5, '0')}` : sec;
}

export function formatSolve(s: Pick<Solve, 'time' | 'penalty'>): string {
  if (s.penalty === 'DNF') return `DNF(${formatTime(s.time)})`;
  return s.penalty === '+2' ? `${formatTime(s.time + 2000)}+` : formatTime(s.time);
}

/** How many results are trimmed from each end of an average of n (WCA / csTimer: 5%, at least 1). */
export function trimCount(n: number): number {
  return n <= 4 ? 0 : Math.max(1, Math.ceil(n * 0.05));
}

/**
 * Average of the given results (ms, DNF = Infinity): drop the best and worst `trimCount`, mean of
 * the rest. DNF if more DNFs than can be trimmed. null if fewer than n results are given.
 */
export function averageOf(times: number[]): number {
  const n = times.length;
  const k = trimCount(n);
  const sorted = [...times].sort((a, b) => a - b);
  const kept = sorted.slice(k, n - k);
  if (kept.some((t) => !Number.isFinite(t))) return Infinity;
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

export function meanOf(times: number[]): number {
  if (times.some((t) => !Number.isFinite(t))) return Infinity;
  return times.reduce((a, b) => a + b, 0) / times.length;
}

/**
 * Rolling aoN after each solve (solves in chronological order): result[i] is the average of solves
 * i-n+1..i, or null when fewer than n solves exist.
 */
export function rollingAverage(solves: Solve[], n: number): (number | null)[] {
  const t = solves.map(effective);
  return t.map((_, i) => (i + 1 < n ? null : averageOf(t.slice(i + 1 - n, i + 1))));
}

export interface Stats {
  count: number;
  /** Solves that were not DNF. */
  completed: number;
  best: number | null;
  worst: number | null;
  /** Mean of all non-DNF solves. */
  mean: number | null;
  current: Record<number, number | null>;
  bestAvg: Record<number, number | null>;
}

export const AVERAGES = [5, 12, 100] as const;

const least = (v: number[]) => v.reduce((a, b) => Math.min(a, b), Infinity);
const most = (v: number[]) => v.reduce((a, b) => Math.max(a, b), -Infinity);

/** Stats for solves in chronological order. */
export function computeStats(solves: Solve[]): Stats {
  const t = solves.map(effective);
  const finite = t.filter(Number.isFinite);
  const current: Record<number, number | null> = {};
  const bestAvg: Record<number, number | null> = {};
  for (const n of AVERAGES) {
    const roll = rollingAverage(solves, n);
    current[n] = roll.length ? roll[roll.length - 1] : null;
    const vals = roll.filter((x): x is number => x !== null);
    bestAvg[n] = vals.length ? least(vals) : null;
  }
  return {
    count: solves.length,
    completed: finite.length,
    best: finite.length ? least(finite) : null,
    worst: finite.length ? most(finite) : null,
    mean: finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : null,
    current,
    bestAvg,
  };
}
