/** The Learn tab's beginner course: every demo starts the way its text describes. */
import { describe, expect, test } from 'vitest';
import { applyMovesToArray, invertAlg, parseAlg, solvedState, toColorArray } from '../src/core/cube';
import { BEGINNER, HOLD, holdOf, type Lesson, NOTATION_MOVES, SPEEDUPS } from '../src/learn/beginner';
import { EN } from '../src/i18n/locales/en';
import { type Stickers, centerColor, cubie, pieceSolved } from '../src/solve/pieces';

const SOLVED = toColorArray(solvedState());
const held = applyMovesToArray(SOLVED, HOLD);

/** The state a case's demo starts from, as the viewer computes it (setup anchored at the end). */
function start(lesson: string, id: string): Stickers {
  const l = [...BEGINNER, ...SPEEDUPS].find((k) => k.id === lesson)!;
  const c = l.cases.find((k) => k.id === id)!;
  const hold = applyMovesToArray(SOLVED, holdOf(l));
  return applyMovesToArray(applyMovesToArray(hold, c.end ?? ''), invertAlg(parseAlg(c.alg)));
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

test('the cross is built with white on top, and the last step turns the cube over', () => {
  for (const id of ['cross', 'twist']) {
    const h = applyMovesToArray(SOLVED, holdOf(BEGINNER.find((l) => l.id === id)!));
    expect(centerColor(h, 'U')).toBe('W');
    expect(centerColor(h, 'D')).toBe('Y');
  }
  for (const l of BEGINNER.filter((k) => !['cross', 'twist'].includes(k.id))) expect(holdOf(l)).toBe(HOLD);
});

test('every lesson has a known stage, and every algorithm parses', () => {
  for (const l of BEGINNER as Lesson[]) {
    expect(['inspection', 'cross', 'corners', 'middle', 'top']).toContain(l.stage);
    for (const c of l.cases) expect(parseAlg(c.alg).length).toBeGreaterThan(0);
    for (const a of Object.values(l.algs ?? {})) expect(parseAlg(a).length).toBeGreaterThan(0);
  }
  for (const m of NOTATION_MOVES) expect(parseAlg(m)).toHaveLength(1);
});

describe('cross (white on top)', () => {
  const TOP_CROSS = ['UR', 'UB', 'UL'];
  test('in the bottom layer, white facing down, one turn of D away from its center', () => {
    const s = start('cross', 'bottom');
    expect(at(s, 'DR', 'D')).toBe('W');
    expect(at(s, 'DR', 'R')).toBe(centerColor(s, 'F'));
    expect(solved(s, ...TOP_CROSS)).toBe(true);
  });
  test('on top but flipped: white facing the front', () => {
    const s = start('cross', 'flipped');
    expect(at(s, 'UF', 'F')).toBe('W');
    expect(at(s, 'UF', 'U')).toBe(centerColor(s, 'F'));
    expect(solved(s, ...TOP_CROSS)).toBe(true);
  });
  test('in the middle layer at the front-right, white facing the front', () => {
    const s = start('cross', 'middle');
    expect(at(s, 'FR', 'F')).toBe('W');
    expect(at(s, 'FR', 'R')).toBe(centerColor(s, 'F'));
    expect(solved(s, ...TOP_CROSS)).toBe(true);
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
  test('left 4-moves: front-left, white facing left', () => {
    const s = start('corners', 'left');
    expect(at(s, 'UFL', 'L')).toBe('W');
    expect(solved(s, ...CROSS, 'DFR', 'DRB', 'DBL')).toBe(true);
  });
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

test('cube turned over, twisted corners at the bottom front-right and front-left, all in place', () => {
  const s = start('twist', 'two');
  const yellowDown = (name: string) => at(s, name, 'D') === 'Y';
  const corners = ['DFR', 'DRB', 'DBL', 'DLF'];
  expect(corners.filter((c) => !yellowDown(c))).toEqual(['DFR', 'DLF']);
  expect(corners.every((c) => inPlace(s, c))).toBe(true);
  expect(solved(s, 'UF', 'UR', 'UB', 'UL', 'UFR', 'URB', 'UBL', 'ULF', 'FR', 'FL', 'BR', 'BL', 'DF', 'DR', 'DB', 'DL', 'DRB', 'DBL')).toBe(true);
});

describe('going faster', () => {
  const has = (k: string) => k in EN;
  test('every tip, case and step link has its text, and every algorithm parses', () => {
    for (const g of SPEEDUPS) {
      expect(has(`learn.${g.id}.title`)).toBe(true);
      if (g.step) expect(BEGINNER.some((l) => l.id === g.step)).toBe(true);
      for (const tip of g.tips) {
        expect(has(`learn.${g.id}.${tip.id}`), tip.id).toBe(true);
        expect(has(`learn.${g.id}.${tip.id}.text`), tip.id).toBe(true);
        expect(EN[`learn.${g.id}.${tip.id}.text` as keyof typeof EN].includes('{alg}')).toBe(!!tip.alg);
        if (tip.alg) expect(parseAlg(tip.alg).length).toBeGreaterThan(0);
      }
      for (const c of g.cases) {
        expect(has(`learn.${g.id}.${c.id}`), c.id).toBe(true);
        expect(has(`learn.${g.id}.${c.id}.desc`), c.id).toBe(true);
        expect(parseAlg(c.alg).length).toBeGreaterThan(0);
      }
    }
  });

  const TOP_CROSS = ['UR', 'UB', 'UL'];
  test('cross: an edge in the middle layer slides up with one turn', () => {
    const s = start('fast.cross', 'slide');
    expect(at(s, 'FR', 'F')).toBe('W');
    expect(at(s, 'FR', 'R')).toBe(centerColor(s, 'F'));
    expect(solved(s, ...TOP_CROSS)).toBe(true);
    const d = start('fast.cross', 'direct');
    expect(at(d, 'FR', 'R')).toBe('W');
    expect(at(d, 'FR', 'F')).toBe(centerColor(d, 'F'));
    expect(solved(d, ...TOP_CROSS)).toBe(true);
  });

  test('corners: white on top goes in with two sets', () => {
    const s = start('fast.corners', 'up');
    expect(at(s, 'UFR', 'U')).toBe('W');
    expect(solved(s, ...CROSS, 'DRB', 'DBL', 'DLF')).toBe(true);
    expect(parseAlg(SPEEDUPS[1].cases[0].alg)).toHaveLength(8);
  });

  for (const [id, face] of [['keepRight', 'R'], ['keepLeft', 'F'], ['keepUp', 'U']]) {
    test(`corners: white facing ${face}, the front-right middle edge already solved and kept`, () => {
      const s = start('fast.corners', id);
      expect(at(s, 'UFR', face)).toBe('W');
      expect(solved(s, ...CROSS, 'DRB', 'DBL', 'DLF', 'FR')).toBe(true);
    });
  }

  test('middle: the two right edges swapped', () => {
    const s = start('fast.middle', 'swap');
    expect(solved(s, ...FIRST, 'FL', 'BL')).toBe(true);
    expect(inPlace(s, 'FR') || inPlace(s, 'BR')).toBe(false);
    const fr = cubie('FR').map((i) => s[i]).sort().join('');
    expect(fr).toBe([centerColor(s, 'B'), centerColor(s, 'R')].sort().join(''));
  });

  test('middle: the front-right edge flipped in its slot', () => {
    const s = start('fast.middle', 'flipped');
    expect(inPlace(s, 'FR')).toBe(true);
    expect(solved(s, 'FR')).toBe(false);
    expect(solved(s, ...FIRST, 'FL', 'BR', 'BL')).toBe(true);
    expect(parseAlg(SPEEDUPS[2].cases[1].alg)).toHaveLength(11);
  });

  test('top: an L at the front and right becomes the cross in one go', () => {
    const s = start('fast.top', 'wide');
    expect(['UB', 'UL', 'UR', 'UF'].filter((e) => yellowUp(s, e))).toEqual(['UR', 'UF']);
    expect(solved(s, ...F2L)).toBe(true);
  });

  test('top: opposite edges, the second go is always after U2', () => {
    const c = BEGINNER.find((l) => l.id === 'yedges')!.cases.find((k) => k.id === 'opposite')!;
    expect(c.alg).toContain(' U2 ');
  });

  test('top: the left-hand corner cycle does in one go what the usual one does in two', () => {
    expect(start('fast.top', 'corners')).toEqual(start('ycorners', 'twice'));
    const leftColour = (st: Stickers) => cubie('ULF').some((i) => st[i] === centerColor(st, 'L'));
    expect(leftColour(start('fast.top', 'corners'))).toBe(true);
    expect(leftColour(start('ycorners', 'one'))).toBe(false);
  });

  test('twist: two backwards 4-moves are four 4-moves', () => {
    expect(start('fast.twist', 'two')).toEqual(start('twist', 'two'));
  });
});
