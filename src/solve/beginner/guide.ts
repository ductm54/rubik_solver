/**
 * Beginner guide: the beginner method exactly as the Learn tab teaches it (J Perm's beginner
 * guide), with the Learn tab's "Go faster" shortcuts switched on layer by layer.
 *
 *   1. cross with the cross colour on TOP: D to line an edge up, F2 to lift it, F U' R U to flip
 *      it, R' D' R to drop a middle edge, F2 to drop a wrong top edge
 *      faster: slide a middle edge straight up (U^a, one face turn, U^-a)
 *   2. turn the cube over; corners with the right or left 4-moves (white facing you: turn and
 *      use the other hand), a stuck corner taken out with one 4-moves
 *      faster: white on top in two sets, a stuck corner out with the left hand, keep a solved
 *      middle edge
 *   3. middle edges with two sets of 4-moves (right or left)
 *      faster: R2 U2 R2 U2 R2 swaps the two right edges, R U2 R' U R U2 R' U F' U' F flips one
 *   4. yellow cross F R U R' U' F'   faster: f R U R' U' f' from the backwards L
 *   5. yellow edges R U R' U R U2 R' U   faster: opposite edges, the second go right after U2
 *   6. yellow corners U R U' L' U R' U' L   faster: L' U R U' L U R' U' instead of twice
 *   7. turn over again, R U R' U' at the bottom front-right, D for the next corner
 *      faster: two backwards 4-moves (U R U' R') instead of four
 *
 * Every step is chosen by trying the guide's moves on the cube and keeping the shortest that
 * works, so each step really does what its hint says.
 */
import { type Color, type CubeState, applyMovesToArray, countMoves, parseAlg, simplifyAlg, toColorArray } from '../../core/cube';
import { validate } from '../../core/validate';
import { cap, t } from '../../i18n';
import {
  CORNER_CYCLE,
  CORNER_CYCLE_BACK,
  CORNER_UP_FAST,
  CORNER_UP_FAST_LEFT,
  CROSS_DROP,
  CROSS_FLIP,
  FLIP_MIDDLE,
  KEEP_EDGE_LEFT,
  KEEP_EDGE_RIGHT,
  LEFT_SEXY,
  MIDDLE_LEFT,
  MIDDLE_RIGHT,
  REVERSE_SEXY,
  SEXY,
  SWAP_RIGHT_EDGES,
  YELLOW_CROSS,
  YELLOW_CROSS_WIDE,
  YELLOW_EDGES_ALG,
} from '../../learn/beginner';
import { colorNames, colorWord } from '../mask';
import { type Stickers, centerColor, cubie, pieceSolved } from '../pieces';
import type { MethodDef, SettingValues, SolvePlan, SolveStep } from '../types';
import { Builder } from './index';

/** The layers whose shortcuts can be switched on. */
export type Layer = 'cross' | 'corners' | 'middle' | 'last';
export const LAYERS: Layer[] = ['cross', 'corners', 'middle', 'last'];

const Y = ['', 'y', 'y2', "y'"];
const U_TURNS = ['', 'U', 'U2', "U'"];
const D_TURNS = ['', 'D', 'D2', "D'"];
const EDGE_POS = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'];
const CORNER_POS = ['UFR', 'URB', 'UBL', 'ULF', 'DFR', 'DRB', 'DBL', 'DLF'];
const U_EDGES = ['UF', 'UR', 'UB', 'UL'];
const U_CORNERS = ['UFR', 'URB', 'UBL', 'ULF'];
const D_CORNERS = ['DFR', 'DLF', 'DBL', 'DRB'];
const UNDO_U: Record<string, string> = { '': '', U: "U'", U2: 'U2', "U'": 'U' };

const word = colorWord;
const names = colorNames;
const times = (n: number) => t('solve.times', { count: n });
const repeat = (alg: string, n: number) => Array(n).fill(alg).join(' ');
const len = (parts: string[]) => countMoves(simplifyAlg(parseAlg(parts.join(' '))));
const sameSet = (a: Color[], b: Color[]) => a.length === b.length && a.every((c) => b.includes(c));
const homeColors = (st: Stickers, pos: string) => [...pos].map((f) => centerColor(st, f as never));

/** Where the piece with these colours belongs now (by the centers), as a position name. */
const homeOf = (st: Stickers, colors: Color[]) => (colors.length === 2 ? EDGE_POS : CORNER_POS).find((p) => sameSet(homeColors(st, p), colors))!;
/** The piece with these colours is solved, whichever way the cube is held. */
const done = (st: Stickers, colors: Color[]) => pieceSolved(st, cubie(homeOf(st, colors)));
const allDone = (st: Stickers, pieces: Color[][]) => pieces.every((p) => done(st, p));
/** The cube turn (y) that brings the slot of these colours to `pos`. */
const turnTo = (st: Stickers, colors: Color[], pos: string) => Y.find((y) => homeOf(applyMovesToArray(st, y), colors) === pos);

interface Cand {
  parts: string[];
  kind: string;
  /** Extra cost, in moves. */
  penalty?: number;
  data?: Record<string, string | number>;
}

/** Of the candidates that pass `ok`, the cheapest. */
function cheapest(st: Stickers, cands: Cand[], ok: (after: Stickers) => boolean): Cand | null {
  let best: Cand | null = null;
  let bestCost = Infinity;
  for (const c of cands) {
    const cost = len(c.parts) + (c.penalty ?? 0);
    if (cost >= bestCost) continue;
    if (!ok(applyMovesToArray(st, c.parts.join(' ')))) continue;
    best = c;
    bestCost = cost;
  }
  return best;
}

function solveFrom(start: Stickers, hold: string, cross: Color, fast: Set<Layer>): SolveStep[] {
  const scheme = Object.fromEntries([...'URFDLB'].map((f, i) => [f, start[i * 9 + 4]]));
  const b = new Builder(start, scheme, cross);
  const held = applyMovesToArray(start, hold);
  const last = centerColor(held, 'D');
  const sides = ['F', 'R', 'B', 'L'].map((f) => centerColor(held, f as never));
  const crossEdges = sides.map((s) => [cross, s]);
  const corners = sides.map((s, i) => [cross, s, sides[(i + 1) % 4]]);
  const middle = sides.map((s, i) => [s, sides[(i + 1) % 4]]);
  const lastEdges = sides.map((s) => [last, s]);
  const firstLayer = [...crossEdges, ...corners];
  const twoLayers = [...firstLayer, ...middle];

  b.push(
    'inspection',
    {
      title: t('gd.holdTitle', { cross: word(cross), front: word(centerColor(held, 'F')) }),
      caseName: hold ? undefined : t('solve.alreadyHeld'),
      hint: t('gd.holdHint', { cross: word(cross) }),
    },
    hold,
    crossEdges,
  );

  // 1. Cross on top, one edge at a time, cheapest first.
  const shown = crossEdges.filter((e) => done(b.st, e));
  if (shown.length) b.push('cross', { title: t('gd.crossDone', { n: shown.length }), caseName: t('solve.alreadySolved') }, '', [...shown]);
  while (shown.length < 4) {
    let pick: { cand: Cand; edge: Color[] } | null = null;
    for (const edge of crossEdges.filter((e) => !shown.includes(e))) {
      const cands: Cand[] = [];
      // Ways to get the edge into the bottom layer first.
      const firsts: Cand[] = [{ parts: [], kind: '' }];
      for (const y of Y) {
        firsts.push({ parts: [y, CROSS_DROP], kind: 'drop' });
        firsts.push({ parts: [y, 'F2'], kind: 'down' });
      }
      for (const f of firsts) {
        const st = applyMovesToArray(b.st, f.parts.join(' '));
        const y = turnTo(st, edge, 'UF')!;
        for (const d of D_TURNS) {
          cands.push({ parts: [...f.parts, y, `${d} F2`], kind: `${f.kind}|lift` });
          cands.push({ parts: [...f.parts, y, `${d} F2`, CROSS_FLIP], kind: `${f.kind}|liftFlip` });
        }
        cands.push({ parts: [...f.parts, y, CROSS_FLIP], kind: `${f.kind}|flip` });
      }
      if (fast.has('cross')) {
        const y = turnTo(b.st, edge, 'UF')!;
        for (const u of U_TURNS) for (const m of ['R', "R'", 'L', "L'", 'F', "F'"]) cands.push({ parts: [y, u, m, UNDO_U[u]], kind: 'slide' });
      }
      const keep = shown;
      const c = cheapest(b.st, cands, (after) => done(after, edge) && allDone(after, keep));
      if (c && (!pick || len(c.parts) < len(pick.cand.parts))) pick = { cand: c, edge };
    }
    if (!pick) throw new Error('Cross did not finish (internal error)');
    const { cand, edge } = pick;
    shown.push(edge);
    const [first, then] = cand.kind.split('|');
    const hint =
      cand.kind === 'slide'
        ? t('gd.crossSlide', { side: word(edge[1]), cross: word(cross) })
        : (first ? t(first === 'drop' ? 'gd.crossDrop' : 'gd.crossDown', { cross: word(cross) }) + ' ' : '') +
          t(`gd.cross.${then}`, { side: word(edge[1]), cross: word(cross) });
    b.push('cross', { title: t('gd.crossTitle', { n: shown.length, edge: names(edge) }), caseName: cand.kind === 'slide' ? t('gd.faster') : undefined, hint }, cand.parts, [...shown]);
    for (const e of crossEdges) if (!shown.includes(e) && done(b.st, e)) shown.push(e);
  }

  // 2. Turn over, then the corners.
  b.push('corners', { title: t('gd.turnOver'), hint: t('gd.turnOverHint', { cross: word(cross), top: word(last) }) }, 'x2', crossEdges);
  const shownCorners = corners.filter((c) => done(b.st, c));
  while (shownCorners.length < 4) {
    let pick: { cand: Cand; corner: Color[] } | null = null;
    const middleDone = middle.filter((m) => done(b.st, m));
    for (const corner of corners.filter((c) => !shownCorners.includes(c))) {
      const cands: Cand[] = [];
      const firsts: Cand[] = [{ parts: [], kind: '' }];
      for (const y of Y) {
        firsts.push({ parts: [y, SEXY], kind: 'out' });
        if (fast.has('corners')) firsts.push({ parts: [y, LEFT_SEXY], kind: 'outLeft' });
      }
      for (const f of firsts) {
        const st = applyMovesToArray(b.st, f.parts.join(' '));
        const yr = turnTo(st, corner, 'DFR')!;
        const yl = turnTo(st, corner, 'DLF')!;
        for (const u of U_TURNS) {
          for (const n of [1, 3, 5]) {
            cands.push({ parts: [...f.parts, yr, u, repeat(SEXY, n)], kind: `${f.kind}|right`, data: { n } });
            cands.push({ parts: [...f.parts, yl, u, repeat(LEFT_SEXY, n)], kind: `${f.kind}|left`, data: { n } });
          }
          if (fast.has('corners')) {
            cands.push({ parts: [...f.parts, yr, u, CORNER_UP_FAST], kind: `${f.kind}|upRight` });
            cands.push({ parts: [...f.parts, yl, u, CORNER_UP_FAST_LEFT], kind: `${f.kind}|upLeft` });
            cands.push({ parts: [...f.parts, yr, u, KEEP_EDGE_RIGHT], kind: `${f.kind}|keepRight` });
            cands.push({ parts: [...f.parts, yl, u, KEEP_EDGE_LEFT], kind: `${f.kind}|keepLeft` });
          }
        }
      }
      const keep = [...crossEdges, ...shownCorners];
      // With the faster corners, a middle edge already in place is worth keeping (about 9 moves to put back).
      const lost = (after: Stickers) => middleDone.filter((m) => !done(after, m)).length;
      if (fast.has('corners')) for (const c of cands) c.penalty = 9 * lost(applyMovesToArray(b.st, c.parts.join(' ')));
      const c = cheapest(b.st, cands, (after) => done(after, corner) && allDone(after, keep));
      const cost = (x: Cand) => len(x.parts) + (x.penalty ?? 0);
      if (c && (!pick || cost(c) < cost(pick.cand))) pick = { cand: c, corner };
    }
    if (!pick) throw new Error('First layer did not finish (internal error)');
    const { cand, corner } = pick;
    shownCorners.push(corner);
    const [first, then] = cand.kind.split('|');
    const n = Number(cand.data?.n ?? 1);
    const hint =
      (first ? t(first === 'out' ? 'gd.cornerOut' : 'gd.cornerOutLeft', { cross: word(cross) }) + ' ' : '') +
      t(`gd.corner.${then}`, { slot: names(corner.slice(1)), times: times(n), cross: word(cross) });
    const faster = first === 'outLeft' || ['upRight', 'upLeft', 'keepRight', 'keepLeft'].includes(then);
    b.push(
      'corners',
      {
        title: t('gd.cornerTitle', { n: shownCorners.length, colors: names(corner) }),
        caseName: faster ? t('gd.faster') : n > 1 ? `${cap(times(n))}` : undefined,
        hint,
      },
      cand.parts,
      [...crossEdges, ...shownCorners, ...middle.filter((m) => done(applyMovesToArray(b.st, cand.parts.join(' ')), m))],
    );
    for (const c of corners) if (!shownCorners.includes(c) && done(b.st, c)) shownCorners.push(c);
  }

  // 3. Middle edges.
  const middleIn = (st: Stickers) => middle.filter((m) => done(st, m));
  for (let guard = 0; middleIn(b.st).length < 4; guard++) {
    if (guard > 12) throw new Error('Middle layer did not finish (internal error)');
    const before = middleIn(b.st).length;
    const cands: Cand[] = [];
    for (const y of Y) {
      for (const u of U_TURNS) {
        // The algorithm starts with a U of its own: a U before it is merged in (U U → U2).
        cands.push({ parts: [y, `${u} ${MIDDLE_RIGHT}`], kind: 'right' });
        cands.push({ parts: [y, `${u} ${MIDDLE_LEFT}`], kind: 'left' });
      }
      if (fast.has('middle')) {
        cands.push({ parts: [y, SWAP_RIGHT_EDGES], kind: 'swap' });
        cands.push({ parts: [y, FLIP_MIDDLE], kind: 'flip' });
      }
    }
    const keep = (after: Stickers) => allDone(after, firstLayer) && middleIn(after).length > before && middleIn(b.st).every((m) => done(after, m));
    // Two edges in one go beats one at a time.
    const two = fast.has('middle') ? cheapest(b.st, cands.filter((c) => c.kind === 'swap'), (after) => keep(after) && middleIn(after).length >= before + 2) : null;
    const c = two ?? cheapest(b.st, cands, keep);
    if (c) {
      const after = applyMovesToArray(b.st, c.parts.join(' '));
      const placed = middleIn(after).filter((m) => !middleIn(b.st).includes(m));
      b.push(
        'middle',
        {
          title: t('gd.middleTitle', { colors: placed.map(names).join(' + ') }),
          caseName: t(`gd.middle.${c.kind}`),
          hint: t(`gd.middle.${c.kind}Hint`, { top: word(last) }),
        },
        c.parts,
        [...firstLayer, ...middleIn(after)],
      );
    } else {
      // Every top edge has the top colour: an edge is stuck in a wrong slot, or flipped.
      const y = Y.find((r) => !done(applyMovesToArray(b.st, r), homeColors(applyMovesToArray(b.st, r), 'FR')))!;
      b.push('middle', { title: t('beg.stuckTitle'), caseName: t('beg.stuckCase'), hint: t('gd.middle.stuckHint') }, [y, MIDDLE_RIGHT], [...firstLayer, ...middleIn(b.peek(`${y} ${MIDDLE_RIGHT}`))]);
    }
  }

  // 4. Yellow cross.
  const fastLast = fast.has('last');
  const oriented = (st: Stickers) => U_EDGES.map((e) => st[cubie(e)[0]] === centerColor(st, 'U'));
  for (let guard = 0; oriented(b.st).some((o) => !o); guard++) {
    if (guard > 3) throw new Error('Top cross did not finish (internal error)');
    const o = oriented(b.st);
    const n = o.filter(Boolean).length;
    let parts = ['', YELLOW_CROSS];
    let caseName = t('beg.dot');
    let hint = t('beg.dotHint', { top: word(last), alg: YELLOW_CROSS });
    if (n === 2 && o[0] === o[2]) {
      parts = [o[0] ? 'U' : '', YELLOW_CROSS];
      caseName = t('beg.line');
      hint = t('beg.lineHint', { top: word(last), alg: YELLOW_CROSS });
    } else if (n === 2 && fastLast) {
      const u = U_TURNS.find((x) => oriented(b.peek(x))[0] && oriented(b.peek(x))[1])!;
      parts = [u, YELLOW_CROSS_WIDE];
      caseName = `${t('beg.L')} · ${t('gd.faster')}`;
      hint = t('gd.wideHint', { top: word(last), alg: YELLOW_CROSS_WIDE });
    } else if (n === 2) {
      const u = U_TURNS.find((x) => oriented(b.peek(x))[2] && oriented(b.peek(x))[3])!;
      parts = [u, YELLOW_CROSS];
      caseName = t('beg.L');
      hint = t('beg.LHint', { top: word(last), alg: YELLOW_CROSS });
    }
    b.push('top', { title: t('beg.topCross', { top: cap(word(last)) }), caseName, hint }, parts, 'eo');
  }

  // 5. Yellow edges matching their centers.
  const matched = (st: Stickers) => allDone(st, lastEdges);
  const lined = (st: Stickers) => U_TURNS.some((u) => matched(applyMovesToArray(st, u)));
  const edgesShown = [...twoLayers, ...lastEdges];
  for (let guard = 0; !lined(b.st); guard++) {
    if (guard > 3) throw new Error('Top edges did not finish (internal error)');
    const one: Cand[] = [];
    const twice: Cand[] = [];
    for (const u of U_TURNS)
      for (const y of Y) {
        one.push({ parts: [`${u} ${y}`, YELLOW_EDGES_ALG], kind: 'one' });
        twice.push({ parts: [`${u} ${y}`, YELLOW_EDGES_ALG, 'U2', YELLOW_EDGES_ALG], kind: 'twice' });
      }
    const c = cheapest(b.st, one, lined) ?? (fastLast ? cheapest(b.st, twice, lined) : null) ?? cheapest(b.st, one, (after) => cheapest(after, one, lined) !== null);
    if (!c) throw new Error('Top edges (internal error)');
    const fixes = lined(applyMovesToArray(b.st, c.parts.join(' ')));
    b.push(
      'top',
      {
        title: t('beg.topEdges'),
        caseName: c.kind === 'twice' ? `${t('beg.opposite')} · ${t('gd.faster')}` : t(fixes ? 'beg.adjacent' : 'beg.oppositeFirst'),
        hint: t(c.kind === 'twice' ? 'gd.oppositeHint' : fixes ? 'beg.edgesHint' : 'beg.edgesHintOpposite', { alg: YELLOW_EDGES_ALG }),
      },
      c.parts,
      edgesShown,
    );
  }
  const auf = U_TURNS.find((u) => matched(b.peek(u)))!;
  if (auf) b.push('top', { title: t('beg.topEdges'), caseName: t('beg.lineUp'), hint: t('beg.lineUpHint') }, auf, edgesShown);

  // 6. Yellow corners to their places (any twist).
  const placed = (st: Stickers) => U_CORNERS.filter((c) => sameSet(homeColors(st, c), [...cubie(c)].map((i) => st[i])));
  for (let guard = 0; placed(b.st).length < 4; guard++) {
    if (guard > 3) throw new Error('Top corners did not finish (internal error)');
    const cands: Cand[] = [];
    for (const y of Y) {
      cands.push({ parts: [y, CORNER_CYCLE], kind: 'one' });
      if (fastLast) cands.push({ parts: [y, CORNER_CYCLE_BACK], kind: 'back' });
    }
    const all = (after: Stickers) => placed(after).length === 4;
    const c = cheapest(b.st, cands, all) ?? cheapest(b.st, cands.filter((x) => x.kind === 'one'), (after) => placed(after).length >= 1)!;
    const one = placed(b.st).length > 0;
    b.push(
      'top',
      {
        title: t('beg.cornersPlace'),
        caseName: c.kind === 'back' ? `${t('beg.oneCorner')} · ${t('gd.faster')}` : t(one ? 'beg.oneCorner' : 'beg.noCorner'),
        hint: c.kind === 'back' ? t('gd.backHint', { alg: CORNER_CYCLE_BACK }) : t(one ? 'beg.oneCornerHint' : 'beg.noCornerHint', { alg: CORNER_CYCLE }),
      },
      c.parts,
      'all',
    );
  }

  // 7. Turn over again and twist the corners, now at the bottom.
  const yellowDown = (st: Stickers, c: string) => st[cubie(c)[0]] === centerColor(st, 'D');
  if (U_CORNERS.some((c) => b.st[cubie(c)[0]] !== last)) {
    b.push('top', { title: t('gd.turnOverAgain'), hint: t('gd.turnOverAgainHint', { top: word(last) }) }, 'x2', 'all');
    let n = 0;
    for (let guard = 0; D_CORNERS.some((c) => !yellowDown(b.st, c)); guard++) {
      if (guard > 4) throw new Error('Top corners not twisted (internal error)');
      const d = D_TURNS.find((x) => !yellowDown(b.peek(x), 'DFR'))!;
      let st = b.peek(d);
      let reps = 0;
      while (!yellowDown(st, 'DFR')) {
        st = applyMovesToArray(st, SEXY);
        if (++reps > 4) throw new Error('Corner twist (internal error)');
      }
      n++;
      const reverse = fastLast && reps === 4;
      const alg = reverse ? repeat(REVERSE_SEXY, 2) : repeat(SEXY, reps);
      b.push(
        'top',
        {
          title: t('beg.twistTitle', { n }),
          caseName: reverse ? `${t('gd.reverseCase', { alg: REVERSE_SEXY })} · ${t('gd.faster')}` : t('beg.twistCase', { alg: SEXY, times: times(reps) }),
          hint: reverse
            ? t('gd.reverseHint', { alg: REVERSE_SEXY, top: word(last) })
            : t(d ? 'gd.twistHint' : 'gd.twistHintHere', { alg: SEXY, top: word(last), times: times(reps) }),
        },
        [d, alg],
        'all',
      );
    }
    const dAuf = D_TURNS.find((x) => allDone(b.peek(x), [...lastEdges, ...corners]))!;
    if (dAuf) b.push('top', { title: t('beg.aufTitle'), hint: t('gd.aufHintD') }, dAuf, 'all');
  } else {
    const uAuf = U_TURNS.find((x) => allDone(b.peek(x), lastEdges))!;
    if (uAuf) b.push('top', { title: t('beg.aufTitle'), hint: t('beg.aufHint') }, uAuf, 'all');
  }
  if (!allDone(b.st, [...twoLayers, ...lastEdges, ...sides.map((s, i) => [last, s, sides[(i + 1) % 4]])]))
    throw new Error('Beginner guide solve did not finish (internal error)');
  return b.steps;
}

export function solveGuide(state: CubeState, cross: Color, fast: Layer[] = []): SolvePlan {
  const v = validate(state);
  if (!v.ok) throw new Error(v.errors.join('\n'));
  const start = toColorArray(state);
  const on = new Set(fast);
  let best: SolveStep[] | null = null;
  const total = (s: SolveStep[]) => s.reduce((a, x) => a + x.moves, 0);
  const HOLDS = ['', 'x', 'x2', "x'", 'z', "z'"].flatMap((a) => Y.map((b) => `${a} ${b}`.trim()));
  for (const hold of HOLDS) {
    if (centerColor(applyMovesToArray(start, hold), 'U') !== cross) continue;
    const steps = solveFrom(start, hold, cross, on);
    if (!best || total(steps) < total(best)) best = steps;
  }
  return {
    method: 'Beginner guide',
    steps: best!,
    moves: total(best!),
    note: t(on.size ? 'gd.noteFast' : 'gd.note', { cross: word(cross), layers: LAYERS.filter((l) => on.has(l)).map((l) => t(`set.guide.faster.${l}`)).join(', ') }),
  };
}

export const GUIDE: MethodDef = {
  id: 'guide',
  name: 'Beginner guide (Learn tab)',
  description: "The beginner method exactly as the Learn tab teaches it, with J Perm's shortcuts switched on layer by layer.",
  settings: [
    {
      key: 'crossColor',
      label: 'Cross colour',
      help: 'The colour you start the cross with, on top. Most guides use white.',
      kind: 'choice',
      options: (['W', 'Y', 'G', 'B', 'R', 'O'] as Color[]).map((c) => ({ value: c, label: c })),
    },
    {
      key: 'faster',
      label: 'Faster tricks',
      help: 'Layers that use the shortcuts from the Learn tab\'s "Go faster" part. None: exactly the moves of the guide.',
      kind: 'multi',
      allowEmpty: true,
      options: LAYERS.map((l) => ({ value: l, label: l })),
    },
  ],
  defaults: { crossColor: 'W', faster: [] },
  solve(state: CubeState, s: SettingValues) {
    const c = (Array.isArray(s.crossColor) ? s.crossColor[0] : s.crossColor) as Color;
    const f = (Array.isArray(s.faster) ? s.faster : s.faster ? [s.faster] : []).filter((x): x is Layer => LAYERS.includes(x as Layer));
    return solveGuide(state, 'WYGBRO'.includes(c) && c ? c : 'W', f);
  },
};
