/** The Learn tab's beginner course: every demo starts the way its text describes. */
import { describe, expect, test } from 'vitest';
import { applyMovesToArray, invertAlg, parseAlg, solvedState, toColorArray } from '../src/core/cube';
import { BEGINNER, HOLD, holdOf, type Lesson, NOTATION_MOVES, SPEEDUPS } from '../src/learn/beginner';
import { CFOP_INTRO } from '../src/learn/cfop';
import { CROSS_LESSONS } from '../src/learn/cfopCross';
import { F2L_CASE_IDS, F2L_LESSONS } from '../src/learn/f2l';
import { OLL2_LESSONS, OLL_LESSONS, OLL_LINE, PLL2_LESSONS, PLL_LESSONS } from '../src/learn/lastLayer';
import { F2L_CASES } from '../src/solve/cfop/algs/f2l';
import { faceOf, locate } from '../src/solve/pieces';
import { EN } from '../src/i18n/locales/en';
import { type Stickers, centerColor, cubie, pieceSolved } from '../src/solve/pieces';

const SOLVED = toColorArray(solvedState());
const held = applyMovesToArray(SOLVED, HOLD);

/** The state a case's demo starts from, as the viewer computes it (setup anchored at the end). */
function start(lesson: string, id: string): Stickers {
  const l = [...BEGINNER, ...SPEEDUPS, ...CFOP_INTRO, ...CROSS_LESSONS, ...F2L_LESSONS, ...OLL2_LESSONS, ...PLL2_LESSONS].find((k) => k.id === lesson)!;
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

  for (const [id, face] of [['keepRight', 'R'], ['keepFront', 'F'], ['keepUp', 'U']]) {
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

describe('intro to CFOP: one example solve, stage by stage', () => {
  const ALL = [...F2L, 'UF', 'UR', 'UB', 'UL', 'UFR', 'URB', 'UBL', 'ULF'];
  const LL_CORNERS = ['UFR', 'URB', 'UBL', 'ULF'];
  const LL_EDGES = ['UF', 'UR', 'UB', 'UL'];
  const after = (id: string) => {
    const c = CFOP_INTRO[0].cases.find((k) => k.id === id)!;
    return applyMovesToArray(start('cfop', id), c.alg);
  };
  const topYellow = (st: Stickers) => [...LL_CORNERS, ...LL_EDGES].every((p) => yellowUp(st, p));

  test('each stage starts where the one before ends, and the whole solve is the four in a row', () => {
    const ids = ['cross', 'f2l', 'oll', 'pll'];
    for (let i = 1; i < ids.length; i++) expect(start('cfop', ids[i])).toEqual(after(ids[i - 1]));
    expect(start('cfop', 'all')).toEqual(start('cfop', 'cross'));
    expect(solved(after('all'), ...ALL)).toBe(true);
  });

  test('cross: unsolved before, solved after, white on the bottom', () => {
    expect(centerColor(start('cfop', 'cross'), 'D')).toBe('W');
    expect(solved(start('cfop', 'cross'), ...CROSS)).toBe(false);
    expect(solved(after('cross'), ...CROSS)).toBe(true);
  });

  test('F2L: the first two layers solved after, the cross kept by every insert', () => {
    const c = CFOP_INTRO[0].cases.find((k) => k.id === 'f2l')!;
    let st = start('cfop', 'f2l');
    expect(solved(st, ...F2L)).toBe(false);
    for (const insert of c.show!.split(' · ')) {
      st = applyMovesToArray(st, insert);
      expect(solved(st, ...CROSS)).toBe(true);
      expect(parseAlg(insert).length).toBeLessThanOrEqual(4);
    }
    expect(solved(st, ...F2L)).toBe(true);
  });

  test('OLL: edges yellow up, three corners not, then the whole top yellow', () => {
    const s = start('cfop', 'oll');
    expect(LL_EDGES.every((e) => yellowUp(s, e))).toBe(true);
    expect(LL_CORNERS.filter((c) => !yellowUp(s, c))).toHaveLength(3);
    expect(topYellow(after('oll'))).toBe(true);
  });

  test('PLL: top yellow but two corners and two edges out of place, then solved', () => {
    const s = start('cfop', 'pll');
    expect(topYellow(s)).toBe(true);
    expect(LL_CORNERS.filter((c) => !solved(s, c))).toHaveLength(2);
    expect(LL_EDGES.filter((e) => !solved(s, e))).toHaveLength(2);
    expect(solved(after('pll'), ...ALL)).toBe(true);
  });

  test('every case has its text, and the demo is about 40 moves', () => {
    for (const c of CFOP_INTRO[0].cases) {
      expect(EN[`learn.cfop.${c.id}` as keyof typeof EN]).toBeTruthy();
      expect(EN[`learn.cfop.${c.id}.desc` as keyof typeof EN]).toBeTruthy();
    }
    expect(parseAlg(CFOP_INTRO[0].cases.find((k) => k.id === 'all')!.alg)).toHaveLength(40);
  });
});

/** The insert each joining case ends with. */
const EXPECTED_SETUP: Record<string, string> = {
  'f2lPair.apart': 'joined pair',
  'f2lPair.up': 'right',
  'f2lPair.wrong': 'right',
  'f2lStuck.corner': 'right',
  'f2lStuck.edge': 'joined pair',
  'f2lStuck.flipped': 'front',
};

describe('intuitive F2L: the front-right pair', () => {
  const OTHERS = [...CROSS, 'DLF', 'FL', 'DBL', 'BL', 'DRB', 'BR'];
  /** Where the corner is and which way white faces, and where the edge is: e.g. "UFR R UB". */
  const where = (st: Stickers) => {
    const c = locate(st, cubie('DFR'));
    const e = locate(st, cubie('FR'));
    const pos = (f: number[], order: string) => f.map(faceOf).sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('');
    return `${pos(c, 'UDFBRL')} ${faceOf(c[0])} ${pos(e, 'UDFBRL')}`;
  };
  /** Corner and edge side by side in the top layer, the same colours next to each other. */
  const joined = (st: Stickers) => {
    const c = locate(st, cubie('DFR'));
    const e = locate(st, cubie('FR'));
    if (![...c, ...e].some((i) => faceOf(i) === 'U') || c.some((i) => faceOf(i) === 'D')) return false;
    if (!e.every((i) => c.some((k) => faceOf(k) === faceOf(i)))) return false;
    // The edge's two colours are the corner's side colours: each must face the same way on both.
    return e.every((ei, n) => faceOf(ei) === faceOf(c[n + 1]));
  };
  const lessonCase = (key: string) => {
    const [lesson, id] = key.split('.');
    return F2L_LESSONS.find((l) => l.id === lesson)!.cases.find((k) => k.id === id)!;
  };

  test('the slot at the front-right is the white-blue-red pair', () => {
    expect([centerColor(held, 'D'), centerColor(held, 'F'), centerColor(held, 'R')]).toEqual(['W', 'B', 'R']);
  });

  test('every case is a SpeedCubeDB case: cross and other slots solved, the pair out, solved by the moves', () => {
    for (const [key, id] of Object.entries(F2L_CASE_IDS)) {
      const [lesson, cid] = key.split('.');
      const s = start(lesson, cid);
      expect(solved(s, ...OTHERS)).toBe(true);
      expect(solved(s, 'DFR', 'FR')).toBe(false);
      expect(solved(applyMovesToArray(s, lessonCase(key).alg), ...F2L)).toBe(true);
      const c = F2L_CASES.find((k) => k.id === id)!;
      // Same place for the corner and the edge, up to a U turn (the rest of the top layer may differ).
      const theirs = where(applyMovesToArray(held, invertAlg(parseAlg(c.FR[0]))));
      expect(['', 'U', "U'", 'U2'].map((a) => where(applyMovesToArray(s, a))), key).toContain(theirs);
    }
  });

  test('each case starts where its text puts the corner (and white) and the edge', () => {
    const expected: Record<string, string> = {
      'f2lInsert.right': 'UFR R UB',
      'f2lInsert.front': 'UFR F UL',
      'f2lInsert.joined': 'UFR F UR',
      'f2lInsert.joinedFront': 'UFR R UF',
      'f2lPair.apart': 'UFR F UB',
      'f2lPair.wrong': 'UFR R UR',
      'f2lPair.up': 'UFR U UR',
      'f2lStuck.corner': 'DFR R UR',
      'f2lStuck.edge': 'UFR F FR',
      'f2lStuck.flipped': 'UFR F FR',
    };
    for (const [key, w] of Object.entries(expected)) expect(where(start(...(key.split('.') as [string, string]))), key).toBe(w);
    expect(solved(start('f2lStuck', 'edge'), 'FR')).toBe(true);
    expect(solved(start('f2lStuck', 'flipped'), 'FR')).toBe(false);
  });

  test('ready pairs: joined where the text says, and wrong in the joined-wrong case', () => {
    expect(joined(start('f2lInsert', 'joined'))).toBe(true);
    expect(joined(start('f2lInsert', 'joinedFront'))).toBe(true);
    expect(joined(start('f2lPair', 'wrong'))).toBe(false);
    // R and F' take the corner to its edge.
    expect(joined(applyMovesToArray(start('f2lInsert', 'right'), 'R'))).toBe(true);
    expect(joined(applyMovesToArray(start('f2lInsert', 'front'), "F'"))).toBe(true);
  });

  test('the joining moves lead, after a U turn, to an insert set-up or a joined pair', () => {
    const setups = F2L_LESSONS[0].cases.map((c) => [c.id, where(start('f2lInsert', c.id))] as const);
    const reached: Record<string, string> = {};
    for (const lesson of ['f2lPair', 'f2lStuck']) {
      for (const c of F2L_LESSONS.find((l) => l.id === lesson)!.cases) {
        const parts = c.show!.split(' · ');
        const st = applyMovesToArray(start(lesson, c.id), parts.slice(0, -2).join(' '));
        expect(solved(st, ...OTHERS)).toBe(true);
        const auf = parseAlg(parts.at(-2)!);
        expect(auf.every((m) => m.base === 'U')).toBe(true);
        const after = applyMovesToArray(st, parts.at(-2)!);
        const setup = setups.find(([, w]) => w === where(after))?.[0];
        reached[`${lesson}.${c.id}`] = setup ?? (joined(after) ? 'joined pair' : 'none');
      }
    }
    expect(reached).toEqual(EXPECTED_SETUP);
  });

  test('every case and algorithm has its text', () => {
    for (const l of F2L_LESSONS) {
      for (const k of ['title', 'goal', 'tip', ...Array.from({ length: l.how }, (_, i) => `how${i + 1}`)])
        expect(EN[`learn.${l.id}.${k}` as keyof typeof EN], `${l.id}.${k}`).toBeTruthy();
      for (const c of l.cases) expect(EN[`learn.${l.id}.${c.id}.desc` as keyof typeof EN]).toBeTruthy();
      for (const k of Object.keys(l.algs ?? {})) expect(EN[`learn.${l.id}.alg.${k}` as keyof typeof EN]).toBeTruthy();
    }
  });
});

describe('CFOP cross: the front-bottom edge, white on the bottom', () => {
  /** Where the front-bottom edge is, and which way its white faces: e.g. "UF U". */
  const where = (st: Stickers) => {
    const e = locate(st, cubie('DF'));
    return `${e.map(faceOf).sort((a, b) => 'UDFBRL'.indexOf(a) - 'UDFBRL'.indexOf(b)).join('')} ${faceOf(e[0])}`;
  };
  const expected: Record<string, string> = {
    'crossDown.top': 'UF U',
    'crossDown.side': 'FR R',
    'crossDown.sideFront': 'FR F',
    'crossFix.topFlipped': 'UF F',
    'crossFix.bottomFlipped': 'DF F',
    'crossFix.bottomWrong': 'DR D',
  };
  const ORDER = ['B', 'R', 'G', 'O']; // front, right, back, left
  /** The side colours of the white edges on the bottom, front, right, back, left ('-' if none). */
  const bottomOrder = (st: Stickers) =>
    ['DF', 'DR', 'DB', 'DL'].map((n) => {
      const [d, side] = cubie(n);
      return st[d] === 'W' ? st[side] : '-';
    });

  test('colour order: blue, red, green, orange round the bottom, three edges in order but one turn off', () => {
    expect(['F', 'R', 'B', 'L'].map((f) => centerColor(held, f as never))).toEqual(ORDER);
    const s = start('crossPlan', 'order');
    expect(s[cubie('UF')[0]]).toBe('W'); // the last edge: on top at the front, white up
    const order = bottomOrder(s);
    expect(order.filter((c) => c === '-')).toHaveLength(1);
    expect(solved(s, 'DR') || solved(s, 'DB') || solved(s, 'DL')).toBe(false);
    // Following the order round, each edge comes right after the one before.
    const placed = order.map((c, i) => [c, i] as const).filter(([c]) => c !== '-');
    for (const [c, i] of placed) {
      const next = order[(i + 1) % 4];
      if (next !== '-') expect(ORDER[(ORDER.indexOf(c) + 1) % 4]).toBe(next);
    }
    const afterF2 = applyMovesToArray(s, 'F2');
    expect(bottomOrder(afterF2)).not.toContain('-');
    expect(solved(afterF2, ...CROSS)).toBe(false);
    expect(solved(applyMovesToArray(afterF2, 'D'), ...CROSS)).toBe(true);
  });

  test('held with white on the bottom', () => {
    expect(centerColor(held, 'D')).toBe('W');
  });

  test('every case: the other cross edges solved, the edge where its text says, the cross solved after', () => {
    for (const [key, w] of Object.entries(expected)) {
      const [lesson, id] = key.split('.');
      const s = start(lesson, id);
      const c = CROSS_LESSONS.find((l) => l.id === lesson)!.cases.find((k) => k.id === id)!;
      expect(where(s), key).toBe(w);
      // In the wrong spot it takes the place of the right edge, which waits on top above it.
      if (id === 'bottomWrong') {
        expect(solved(s, 'DB', 'DL')).toBe(true);
        const r = locate(s, cubie('DR'));
        expect(`${r.map(faceOf).sort().join('')} ${faceOf(r[0])}`).toBe('RU U');
        expect(solved(applyMovesToArray(s, 'R2'), 'DR')).toBe(true);
      } else expect(solved(s, 'DR', 'DB', 'DL'), key).toBe(true);
      expect(solved(s, 'DF'), key).toBe(false);
      expect(solved(applyMovesToArray(s, c.alg), ...CROSS), key).toBe(true);
    }
    const all = CROSS_LESSONS.flatMap((l) => l.cases.map((c) => `${l.id}.${c.id}`)).filter((k) => k !== 'crossPlan.order');
    expect(all.sort()).toEqual(Object.keys(expected).sort());
  });

  test('the step-by-step moves do what the text says', () => {
    // Middle, white front: after D the spot is under the right side, R' fills it.
    const sf = applyMovesToArray(start('crossDown', 'sideFront'), "D R'");
    expect(where(applyMovesToArray(sf, 'D'))).not.toBe('DF D');
    expect(locate(sf, cubie('DF')).map(faceOf).sort().join('')).toBe('DR');
    // On top, flipped: U' to the right, R' to the middle layer at the front-right.
    const tf = start('crossFix', 'topFlipped');
    expect(where(applyMovesToArray(tf, "U'"))).toBe('UR R');
    expect(where(applyMovesToArray(tf, "U' R'"))).toBe('FR R');
    // Bottom, flipped: F' lifts it to the front-right, white still facing front.
    expect(where(applyMovesToArray(start('crossFix', 'bottomFlipped'), "F'"))).toBe('FR F');
    // Bottom, wrong spot: R2 to the top, U to the front.
    expect(where(applyMovesToArray(start('crossFix', 'bottomWrong'), 'R2 U'))).toBe('UF U');
  });

  test('every lesson and case has its text', () => {
    for (const l of CROSS_LESSONS) {
      for (const k of ['title', 'goal', 'tip', ...Array.from({ length: l.how }, (_, i) => `how${i + 1}`)])
        expect(EN[`learn.${l.id}.${k}` as keyof typeof EN], `${l.id}.${k}`).toBeTruthy();
      for (const c of l.cases) expect(EN[`learn.${l.id}.${c.id}.desc` as keyof typeof EN]).toBeTruthy();
    }
  });
});

describe('the last layer: 2-look OLL and PLL', () => {
  const LL_EDGES = ['UF', 'UR', 'UB', 'UL'];
  const LL_CORNERS = ['UFR', 'URB', 'UBL', 'ULF'];
  const ALL = [...F2L, ...LL_EDGES, ...LL_CORNERS];
  const yellowEdges = (st: Stickers) => LL_EDGES.filter((e) => yellowUp(st, e)).join(' ');
  /** Which way each corner's yellow faces, e.g. "UFR:F URB:R UBL:B ULF:U". */
  const corners = (st: Stickers) =>
    LL_CORNERS.map((n) => `${n}:${n[cubie(n).findIndex((i) => st[i] === 'Y')]}`).join(' ');
  const topYellow = (st: Stickers) => [...LL_EDGES, ...LL_CORNERS].every((p) => yellowUp(st, p));
  const run = (lesson: string, id: string) => {
    const l = [...OLL2_LESSONS, ...PLL2_LESSONS].find((k) => k.id === lesson)!;
    return applyMovesToArray(start(lesson, id), l.cases.find((c) => c.id === id)!.alg);
  };
  /** The colour of each top edge's side sticker, front, right, back, left. */
  const edgeColours = (st: Stickers) => ['F', 'R', 'B', 'L'].map((f) => at(st, `U${f}`, f)).join('');

  test('every demo starts with F2L solved and ends where its step ends', () => {
    for (const l of OLL2_LESSONS)
      for (const c of l.cases) {
        expect(solved(start(l.id, c.id), ...F2L), c.id).toBe(true);
        const end = run(l.id, c.id);
        if (l.id === 'oll2Edges') expect(yellowEdges(end)).toBe('UF UR UB UL');
        else expect(topYellow(end), c.id).toBe(true);
      }
    for (const l of PLL2_LESSONS)
      for (const c of l.cases) {
        expect(topYellow(start(l.id, c.id)), c.id).toBe(true);
        expect(solved(start(l.id, c.id), ...ALL), c.id).toBe(false);
        expect(solved(run(l.id, c.id), ...ALL), c.id).toBe(true);
      }
  });

  test('yellow cross: line across, L at the front and right, dot; the line move takes a dot to that L', () => {
    expect(yellowEdges(start('oll2Edges', 'line'))).toBe('UR UL');
    expect(yellowEdges(start('oll2Edges', 'l'))).toBe('UF UR');
    expect(yellowEdges(start('oll2Edges', 'dot'))).toBe('');
    expect(yellowEdges(applyMovesToArray(start('oll2Edges', 'dot'), OLL_LINE))).toBe('UF UR');
  });

  test('corners: where each yellow faces, as the text says', () => {
    const expected: Record<string, string> = {
      'oll2Sune.sune': 'UFR:F URB:R UBL:B ULF:U',
      'oll2Sune.antisune': 'UFR:R URB:U UBL:L ULF:F',
      'oll2Corners.H': 'UFR:F URB:B UBL:B ULF:F',
      'oll2Corners.pi': 'UFR:F URB:B UBL:L ULF:L',
      'oll2Corners.headlights': 'UFR:U URB:B UBL:B ULF:U',
      'oll2Corners.T': 'UFR:U URB:U UBL:B ULF:F',
      'oll2Corners.bowtie': 'UFR:F URB:U UBL:L ULF:U',
    };
    for (const [key, w] of Object.entries(expected)) {
      const s = start(...(key.split('.') as [string, string]));
      expect(corners(s), key).toBe(w);
      expect(yellowEdges(s)).toBe('UF UR UB UL');
    }
  });

  test('a few Sunes, each after a U turn, make any corner case yellow', () => {
    const sune = OLL2_LESSONS[1].cases[0].alg;
    const ids = OLL2_LESSONS.slice(1).flatMap((l) => l.cases.map((c) => [l.id, c.id] as const));
    for (const [lesson, id] of ids) {
      let states = [start(lesson, id)];
      let n = 0;
      while (!states.some(topYellow)) {
        states = states.flatMap((st) => ['', 'U', 'U2', "U'"].map((u) => applyMovesToArray(st, `${u} ${sune}`.trim())));
        n++;
      }
      expect(n, id).toBeLessThanOrEqual(3);
    }
  });

  test('PLL corners: headlights on the left with the right corners swapped, or a diagonal swap', () => {
    const adj = start('pll2Corners', 'adjacent');
    expect(at(adj, 'ULF', 'L')).toBe(at(adj, 'UBL', 'L'));
    expect(LL_CORNERS.filter((c) => !solved(adj, c))).toEqual(['UFR', 'URB']);
    const diag = start('pll2Corners', 'diagonal');
    for (const f of ['F', 'R', 'B', 'L']) {
      const row = [0, 2].map((j) => diag['URFDLB'.indexOf(f) * 9 + j]);
      expect(row[0], f).not.toBe(row[1]);
    }
    expect(LL_CORNERS.filter((c) => !solved(diag, c))).toEqual(['UFR', 'UBL']);
  });

  test('PLL edges: corners solved, the edges where the text says', () => {
    for (const c of PLL2_LESSONS[1].cases) expect(solved(start('pll2Edges', c.id), ...F2L, ...LL_CORNERS), c.id).toBe(true);
    // Centers: B front, R right, G back, O left.
    expect(edgeColours(start('pll2Edges', 'Ua'))).toBe('ROGB');
    expect(edgeColours(start('pll2Edges', 'Ub'))).toBe('OBGR');
    expect(edgeColours(start('pll2Edges', 'H'))).toBe('GOBR');
    expect(edgeColours(start('pll2Edges', 'Z'))).toBe('OGRB');
  });

  test('every lesson, case, algorithm and Algorithms-tab link has its text', () => {
    for (const lv of ['oll2', 'pll2', 'pll', 'oll']) expect(EN[`learn.level.${lv}.intro` as keyof typeof EN], lv).toBeTruthy();
    for (const l of [...OLL2_LESSONS, ...PLL2_LESSONS, ...PLL_LESSONS, ...OLL_LESSONS, ...F2L_LESSONS]) {
      for (const k of ['title', 'goal', 'tip', ...Array.from({ length: l.how }, (_, i) => `how${i + 1}`)])
        expect(EN[`learn.${l.id}.${k}` as keyof typeof EN], `${l.id}.${k}`).toBeTruthy();
      for (const c of l.cases) {
        expect(EN[`learn.${l.id}.${c.id}` as keyof typeof EN], `${l.id}.${c.id}`).toBeTruthy();
        expect(EN[`learn.${l.id}.${c.id}.desc` as keyof typeof EN], `${l.id}.${c.id}`).toBeTruthy();
      }
      for (const k of Object.keys(l.algs ?? {})) expect(EN[`learn.${l.id}.alg.${k}` as keyof typeof EN], k).toBeTruthy();
      if (l.ref) expect(EN[`learn.ref.${l.ref.set}${l.ref.twoLook ? '2' : ''}` as keyof typeof EN]).toBeTruthy();
    }
  });
});
