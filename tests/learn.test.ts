/** The Learn tab's beginner course: every demo starts the way its text describes. */
import { describe, expect, test } from 'vitest';
import { applyMovesToArray, invertAlg, parseAlg, solvedState, toColorArray } from '../src/core/cube';
import { BEGINNER, HOLD, type Lesson, MIDDLE_RIGHT, NOTATION_MOVES } from '../src/learn/beginner';
import { COURSES, courseOf } from '../src/learn/courses';
import { CORNER_FRONT, CORNER_RIGHT, CORNER_UP, CROSS_FLIP, FEWER, TWIST_BACK, YELLOW_CROSS_L } from '../src/learn/fewer';
import { type Stickers, centerColor, cubie, pieceSolved } from '../src/solve/pieces';

const SOLVED = toColorArray(solvedState());
const held = applyMovesToArray(SOLVED, HOLD);

/** The state a case's demo starts from, as the viewer computes it (setup anchored at the end). */
function start(lesson: string, id: string): Stickers {
  const c = BEGINNER.find((l) => l.id === lesson)!.cases.find((k) => k.id === id)!;
  return applyMovesToArray(applyMovesToArray(held, c.end ?? ''), invertAlg(parseAlg(c.alg)));
}

const at = (st: Stickers, name: string, face: string) => st[cubie(name)[name.indexOf(face)]];
const solved = (st: Stickers, ...names: string[]) => names.every((n) => pieceSolved(st, cubie(n)));
/** Piece at `name` has the colours of that position (any twist). */
const inPlace = (st: Stickers, name: string) =>
  cubie(name).map((i) => st[i]).sort().join('') === [...name].map((f) => centerColor(st, f as never)).sort().join('');
const CROSS = ['DF', 'DR', 'DB', 'DL'];
const FIRST = [...CROSS, 'DFR', 'DRB', 'DBL', 'DLF'];
const F2L = [...FIRST, 'FR', 'FL', 'BR', 'BL'];
const edgeMatches = (st: Stickers, f: string) => at(st, `U${f}`, f) === centerColor(st, f as never);
const yellowUp = (st: Stickers, name: string) => at(st, name, 'U') === 'Y';

test('held with white on the bottom and yellow on top', () => {
  expect(centerColor(held, 'U')).toBe('Y');
  expect(centerColor(held, 'D')).toBe('W');
});

test('every lesson has a known stage, and every algorithm parses', () => {
  for (const l of BEGINNER as Lesson[]) {
    expect(['inspection', 'cross', 'corners', 'middle', 'top']).toContain(l.stage);
    for (const c of l.cases) expect(parseAlg(c.alg).length).toBeGreaterThan(0);
    for (const a of Object.values(l.algs ?? {})) expect(parseAlg(a).length).toBeGreaterThan(0);
  }
  for (const m of NOTATION_MOVES) expect(parseAlg(m)).toHaveLength(1);
});

describe('cross', () => {
  test('white on top, above its center', () => {
    const s = start('cross', 'top');
    expect(at(s, 'UF', 'U')).toBe('W');
    expect(at(s, 'UF', 'F')).toBe(centerColor(s, 'F'));
    expect(solved(s, 'DR', 'DB', 'DL')).toBe(true);
  });
  test('white facing the front', () => {
    const s = start('cross', 'flipped');
    expect(at(s, 'UF', 'F')).toBe('W');
    expect(solved(s, 'DR', 'DB', 'DL')).toBe(true);
  });
  test('in the middle layer, white facing left', () => {
    const s = start('cross', 'middle');
    expect(at(s, 'FL', 'L')).toBe('W');
    expect(at(s, 'FL', 'F')).toBe(centerColor(s, 'F'));
    expect(solved(s, 'DR', 'DB', 'DL')).toBe(true);
  });
});

describe('white corners', () => {
  for (const [id, face] of [['right', 'R'], ['up', 'U'], ['front', 'F']]) {
    test(`white facing ${face}`, () => {
      const s = start('corners', id);
      expect(at(s, 'UFR', face)).toBe('W');
      expect(solved(s, ...CROSS, 'DRB', 'DBL', 'DLF')).toBe(true);
    });
  }
});

describe('middle layer', () => {
  test('right: front colour on the front center, top colour is the right center', () => {
    const s = start('middle', 'right');
    expect(at(s, 'UF', 'F')).toBe(centerColor(s, 'F'));
    expect(at(s, 'UF', 'U')).toBe(centerColor(s, 'R'));
    expect(solved(s, ...FIRST, 'FL', 'BR', 'BL')).toBe(true);
  });
  test('left: top colour is the left center', () => {
    const s = start('middle', 'left');
    expect(at(s, 'UF', 'F')).toBe(centerColor(s, 'F'));
    expect(at(s, 'UF', 'U')).toBe(centerColor(s, 'L'));
    expect(solved(s, ...FIRST, 'FR', 'BR', 'BL')).toBe(true);
  });
});

describe('yellow cross', () => {
  const pattern = (s: Stickers) => ['UB', 'UL', 'UR', 'UF'].filter((e) => yellowUp(s, e)).join(' ');
  test('line from left to right', () => expect(pattern(start('ycross', 'line'))).toBe('UL UR'));
  test('L at the back and left', () => expect(pattern(start('ycross', 'l'))).toBe('UB UL'));
  test('dot', () => expect(pattern(start('ycross', 'dot'))).toBe(''));
  test('the first two layers stay solved', () => {
    for (const id of ['line', 'l', 'dot']) expect(solved(start('ycross', id), ...F2L)).toBe(true);
  });
});

describe('yellow edges', () => {
  const matching = (s: Stickers) => ['F', 'R', 'B', 'L'].filter((f) => edgeMatches(s, f)).join('');
  test('back and right match', () => expect(matching(start('yedges', 'adjacent'))).toBe('RB'));
  test('front and back match', () => expect(matching(start('yedges', 'opposite'))).toBe('FB'));
  test('the yellow cross is there and the first two layers are solved', () => {
    for (const id of ['adjacent', 'opposite']) {
      const s = start('yedges', id);
      expect(['UF', 'UR', 'UB', 'UL'].every((e) => yellowUp(s, e))).toBe(true);
      expect(solved(s, ...F2L)).toBe(true);
    }
  });
});

describe('yellow corners in place', () => {
  const placed = (s: Stickers) => ['UFR', 'URB', 'UBL', 'ULF'].filter((c) => inPlace(s, c)).join(' ');
  test('one in place, at the front-right', () => {
    expect(placed(start('ycorners', 'one'))).toBe('UFR');
    expect(placed(start('ycorners', 'twice'))).toBe('UFR');
  });
  test('none in place', () => expect(placed(start('ycorners', 'none'))).toBe(''));
  test('everything else is solved', () => {
    for (const id of ['one', 'twice', 'none']) expect(solved(start('ycorners', id), ...F2L, 'UF', 'UR', 'UB', 'UL')).toBe(true);
  });
});

test('twisted corners: front-right and back-right, all pieces in place', () => {
  const s = start('twist', 'two');
  expect(['UFR', 'URB', 'UBL', 'ULF'].filter((c) => !yellowUp(s, c))).toEqual(['UFR', 'URB']);
  expect(['UFR', 'URB', 'UBL', 'ULF'].every((c) => inPlace(s, c))).toBe(true);
  expect(solved(s, ...F2L, 'UF', 'UR', 'UB', 'UL', 'UBL', 'ULF')).toBe(true);
});

describe('fewer moves course', () => {
  const fStart = (lesson: string, id: string): Stickers => {
    const c = FEWER.find((l) => l.id === lesson)!.cases.find((k) => k.id === id)!;
    return applyMovesToArray(applyMovesToArray(held, c.end ?? ''), invertAlg(parseAlg(c.alg)));
  };
  const count = (alg: string) => parseAlg(alg).length;
  const same = (a: Stickers, b: Stickers) => a.join('') === b.join('');

  test('every algorithm parses and every case has text', () => {
    for (const l of FEWER as Lesson[]) {
      for (const c of l.cases) expect(parseAlg(c.alg).length).toBeGreaterThan(0);
      for (const a of Object.values(l.algs ?? {})) expect(parseAlg(a).length).toBeGreaterThan(0);
    }
  });

  test('courses: the beginner course first, both found by their hash', () => {
    expect(COURSES.map((c) => c.id)).toEqual(['beginner', 'fewer']);
    expect(courseOf('#learn').id).toBe('beginner');
    expect(courseOf('#learn=fewer').id).toBe('fewer');
    expect(courseOf('#learn=nope').id).toBe('beginner');
  });

  test('cross: turned, one D lines it up', () => {
    const s = fStart('cross', 'turned');
    expect(solved(s, ...CROSS)).toBe(false);
    expect(CROSS.every((e) => at(s, e, 'D') === 'W')).toBe(true);
  });
  test('cross: flipped in place, in 4 moves instead of F2 and 4', () => {
    const s = fStart('cross', 'flipped');
    expect(at(s, 'DF', 'F')).toBe('W');
    expect(at(s, 'DF', 'D')).toBe(centerColor(s, 'F'));
    expect(solved(s, 'DR', 'DB', 'DL')).toBe(true);
    expect(count(CROSS_FLIP)).toBe(4);
  });

  test('corners: white facing right, up or front, short inserts', () => {
    for (const [id, face] of [['right', 'R'], ['up', 'U'], ['front', 'F']]) {
      const s = fStart('corners', id);
      expect(at(s, 'UFR', face)).toBe('W');
      expect(solved(s, ...CROSS, 'DRB', 'DBL', 'DLF')).toBe(true);
    }
    expect([CORNER_RIGHT, CORNER_FRONT, CORNER_UP].map(count)).toEqual([3, 3, 7]);
  });

  test('middle: a stuck edge pops out while another goes in', () => {
    const s = fStart('middle', 'swap');
    const fl = cubie('FL').map((i) => held[i]).sort().join('');
    expect(cubie('FR').map((i) => s[i]).sort().join('')).toBe(fl);
    expect(at(s, 'UF', 'F')).toBe(centerColor(s, 'F'));
    expect(at(s, 'UF', 'U')).toBe(centerColor(s, 'R'));
    expect(solved(s, ...FIRST, 'BR', 'BL')).toBe(true);
    const after = applyMovesToArray(s, MIDDLE_RIGHT);
    expect(solved(after, ...FIRST, 'FR', 'BR', 'BL')).toBe(true);
    expect(['UF', 'UR', 'UB', 'UL'].some((e) => cubie(e).map((i) => after[i]).sort().join('') === fl)).toBe(true);
  });

  test('yellow cross: L in one go, dot in two', () => {
    const pattern = (s: Stickers) => ['UB', 'UL', 'UR', 'UF'].filter((e) => yellowUp(s, e)).join(' ');
    expect(pattern(fStart('ycross', 'l'))).toBe('UB UL');
    expect(pattern(fStart('ycross', 'dot'))).toBe('');
    for (const id of ['l', 'dot']) expect(solved(fStart('ycross', id), ...F2L)).toBe(true);
    expect(count(YELLOW_CROSS_L)).toBe(6);
  });

  test("twist: D' R' D R twice is R' D' R D four times", () => {
    const X = "R' D' R D";
    expect(same(applyMovesToArray(held, `${X} ${X} ${X} ${X}`), applyMovesToArray(held, `${TWIST_BACK} ${TWIST_BACK}`))).toBe(true);
    const s = fStart('twist', 'front');
    expect(['UFR', 'URB', 'UBL', 'ULF'].filter((c) => !yellowUp(s, c))).toEqual(['UFR', 'URB']);
    expect(at(s, 'UFR', 'F')).toBe('Y');
    expect(solved(s, ...F2L, 'UF', 'UR', 'UB', 'UL', 'UBL', 'ULF')).toBe(true);
    // After the first corner and U, the next one faces right: the usual set twice.
    const next = applyMovesToArray(s, `${TWIST_BACK} ${TWIST_BACK} U`);
    expect(yellowUp(next, 'ULF')).toBe(true);
    expect(at(next, 'UFR', 'R')).toBe('Y');
    // The beginner example: front-right faces right (two sets), the back-right one faces you.
    const two = start('twist', 'two');
    expect(at(two, 'UFR', 'R')).toBe('Y');
    expect(at(applyMovesToArray(two, `${X} ${X} U`), 'UFR', 'F')).toBe('Y');
    expect(same(fStart('twist', 'two'), start('twist', 'two'))).toBe(true);
  });
});
