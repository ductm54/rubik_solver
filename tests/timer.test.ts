import { describe, expect, it } from 'vitest';
import { applyMoves, solvedState, statesEqual } from '../src/core/cube';
import { randomStateScramble } from '../src/core/scramble';
import { validate } from '../src/core/validate';
import { fromCsTimer, toCsTimer } from '../src/timer/cstimer';
import { TimerMachine } from '../src/timer/machine';
import { type Solve, averageOf, computeStats, formatSolve, formatTime, rollingAverage, trimCount } from '../src/timer/stats';
import { MemoryStore } from '../src/timer/store';

const solve = (time: number, penalty: Solve['penalty'] = 'none', i = 0): Solve => ({
  id: String(i),
  time,
  penalty,
  scramble: "R U R'",
  date: 1_700_000_000_000 + i * 60_000,
});

describe('formatting', () => {
  it('formats times like a WCA timer (truncated hundredths)', () => {
    expect(formatTime(12345)).toBe('12.34');
    expect(formatTime(9999)).toBe('9.99');
    expect(formatTime(62340)).toBe('1:02.34');
    expect(formatTime(600000)).toBe('10:00.00');
    expect(formatTime(Infinity)).toBe('DNF');
    expect(formatSolve({ time: 12000, penalty: '+2' })).toBe('14.00+');
    expect(formatSolve({ time: 12000, penalty: 'DNF' })).toBe('DNF(12.00)');
  });
});

describe('averages', () => {
  it('trims 1 each side for ao5 / ao12, 5 for ao100', () => {
    expect(trimCount(5)).toBe(1);
    expect(trimCount(12)).toBe(1);
    expect(trimCount(100)).toBe(5);
    expect(trimCount(3)).toBe(0);
  });

  it('ao5 drops best and worst', () => {
    expect(averageOf([10000, 12000, 11000, 30000, 9000])).toBe(11000);
  });

  it('one DNF in ao5 counts as the worst; two make the average DNF', () => {
    expect(averageOf([10000, 12000, 11000, Infinity, 9000])).toBe(11000);
    expect(averageOf([10000, 12000, Infinity, Infinity, 9000])).toBe(Infinity);
  });

  it('+2 is added before averaging', () => {
    const s = [solve(10000), solve(10000, '+2'), solve(10000), solve(10000), solve(10000)];
    // 10,12,10,10,10 → drop 10 and 12 → 10
    expect(rollingAverage(s, 5)[4]).toBe(10000);
  });

  it('computes current and best rolling averages', () => {
    const times = [20, 18, 16, 14, 12, 30, 11, 13, 15, 17, 19, 21, 10].map((x) => x * 1000);
    const st = computeStats(times.map((t, i) => solve(t, 'none', i)));
    expect(st.count).toBe(13);
    expect(st.best).toBe(10000);
    expect(st.worst).toBe(30000);
    // last 5: 15 17 19 21 10 → 17
    expect(st.current[5]).toBe(17000);
    // best ao5: windows ... 12 30 11 13 15 → 13.33; 16 14 12 30 11 → 14; 14 12 30 11 13 → 13
    expect(st.bestAvg[5]).toBe(13000);
    expect(st.current[12]).not.toBeNull();
    expect(st.current[100]).toBeNull();
  });
});

describe('timer state machine', () => {
  it('inspection → hold → ready → run → stop', () => {
    const m = new TimerMachine();
    m.press(0);
    m.release(100); // inspection starts
    expect(m.state).toBe('inspecting');
    m.press(5000);
    m.tick(5200);
    expect(m.state).toBe('holding');
    m.tick(5300);
    expect(m.state).toBe('ready');
    m.release(5400);
    expect(m.state).toBe('running');
    const r = m.press(17400);
    expect(r).toEqual({ time: 12000, penalty: 'none' });
    m.release(17500);
    expect(m.state).toBe('idle');
  });

  it('false start (released before ready) does not start the clock', () => {
    const m = new TimerMachine();
    m.press(0);
    m.release(10);
    m.press(1000);
    m.tick(1100);
    m.release(1150);
    expect(m.state).toBe('inspecting');
  });

  it('+2 when starting after 15 s of inspection, DNF after 17 s', () => {
    const plus = new TimerMachine();
    plus.press(0);
    plus.release(0);
    plus.press(15200);
    plus.tick(15600);
    plus.release(15600);
    expect(plus.press(25600)).toEqual({ time: 10000, penalty: '+2' });

    const dnf = new TimerMachine();
    dnf.press(0);
    dnf.release(0);
    dnf.press(17100);
    dnf.tick(17500);
    dnf.release(17500);
    expect(dnf.state).toBe('stopped');
    expect(dnf.lastResult).toEqual({ time: 0, penalty: 'DNF' });
  });

  it('without inspection, hold starts straight from idle', () => {
    const m = new TimerMachine({ inspection: false });
    m.press(0);
    m.tick(400);
    m.release(400);
    expect(m.state).toBe('running');
    expect(m.press(9400)).toEqual({ time: 9000, penalty: 'none' });
  });
});

describe('csTimer format', () => {
  it('round-trips solves', () => {
    const solves = [solve(12340, 'none', 1), { ...solve(15000, '+2', 2), note: 'pop' }, solve(20000, 'DNF', 3)];
    const back = fromCsTimer(toCsTimer(solves));
    expect(back.map((s) => [s.time, s.penalty, s.scramble, s.note, s.date])).toEqual(
      solves.map((s) => [s.time, s.penalty, s.scramble, s.note, s.date]),
    );
  });

  it('reads a csTimer export with several sessions', () => {
    const json = JSON.stringify({
      session1: [[[0, 11230], "R U2 F'", '', 1700000100], [[-1, 9000], 'D L', 'oops', 1700000200]],
      session2: [[[2000, 13000], 'B2', '', 1700000050]],
      properties: { sessionData: '{}' },
    });
    const s = fromCsTimer(json);
    expect(s.map((x) => formatSolve(x))).toEqual(['15.00+', '11.23', 'DNF(9.00)']);
    expect(s[2].note).toBe('oops');
  });

  it('rejects files that are not csTimer exports', () => {
    expect(() => fromCsTimer('hello')).toThrow(/not valid JSON/);
    expect(() => fromCsTimer('{"a":1}')).toThrow(/no sessions/);
  });
});

describe('random-state scrambles', () => {
  it('produce valid, varied, 15+ move scrambles', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const { scramble, moveCount } = randomStateScramble();
      expect(moveCount).toBeGreaterThanOrEqual(15);
      const st = applyMoves(solvedState(), scramble);
      expect(validate(st).ok).toBe(true);
      expect(statesEqual(st, solvedState())).toBe(false);
      seen.add(scramble);
    }
    expect(seen.size).toBe(10);
  }, 30_000);
});

describe('memory store', () => {
  it('stores, lists oldest first, updates and deletes', async () => {
    const st = new MemoryStore();
    await st.putMany([solve(2, 'none', 2), solve(1, 'none', 1)]);
    await st.put({ ...solve(3, 'none', 1), note: 'edited' });
    expect((await st.list()).map((s) => s.id)).toEqual(['1', '2']);
    expect((await st.list())[0].note).toBe('edited');
    await st.remove('1');
    expect(await st.list()).toHaveLength(1);
  });
});
