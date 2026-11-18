/**
 * Beginner method (layer by layer), the way it is usually taught (and as on the Learn tab):
 *   1. cross, one edge at a time, with the cross colour on top; then the cube is turned over
 *   2. first-layer corners: corner above its slot, repeat R U R' U' (front-right) or L' U' L U (front-left)
 *   3. middle-layer edges: line the edge up with its center, then the right or left algorithm
 *   4. yellow cross: F R U R' U' F' (dot → L → line → cross)
 *   5. yellow edges in place: R U R' U R U2 R' U
 *   6. last-layer corners in place: U R U' L' U R' U' L
 *   7. last-layer corners twisted: R' D' R D at the front-right, then U to the next corner
 * Every step is worked out by playing it on the cube, so the hints say what really happens.
 */
import { type Color, type CubeState, type Move, applyMovesToArray, countMoves, formatAlg, parseAlg, simplifyAlg, toColorArray } from '../../core/cube';
import { validate } from '../../core/validate';
import { crossEdgesDone, solveCrossEdge } from '../cfop/cross';
import { cap, getLocale, t } from '../../i18n';
import { type MaskStage, colorNames, colorWord, stickeringMask } from '../mask';
import { type Stickers, centerColor, cubie, locate, pieceSolved, positionName } from '../pieces';
import type { MethodDef, SettingValues, SolvePlan, SolveStep } from '../types';

const HOLDS = ['', 'x', 'x2', "x'", 'z', "z'"].flatMap((a) => ['', 'y', 'y2', "y'"].map((b) => `${a} ${b}`.trim()));
const Y = ['', 'y', 'y2', "y'"];
const U_TURNS = ['', 'U', 'U2', "U'"];

const SEXY = "R U R' U'";
const LEFT_SEXY = "L' U' L U";
const MIDDLE_RIGHT = "U R U' R' U' F' U F";
const MIDDLE_LEFT = "U' L' U L U F U' F'";
const YELLOW_CROSS = "F R U R' U' F'";
const YELLOW_EDGES = "R U R' U R U2 R' U";
const CORNER_CYCLE = "U R U' L' U R' U' L";
const CORNER_TWIST = "R' D' R D";
/** Faster corners: the cross colour on top, one set less (R U2 R' U' and one 4-moves). */
const CORNER_UP_FAST = "R U2 R' U' R U R' U'";
const CORNER_UP_FAST_LEFT = "L' U2 L U L' U' L U";
/** Faster corners: put the corner in and keep the solved middle edge next to its slot. */
const KEEP_EDGE = ["U R U R' U2 R U R'", "U' R U' R' U2 R U' R'", "R U R' U' R U R' U' R U R'"];
const KEEP_EDGE_LEFT = ["U' L' U' L U2 L' U' L", "U L' U L U2 L' U L", "L' U' L U L' U' L U L' U' L"];

const CROSS_HOMES = ['DF', 'DR', 'DB', 'DL'];
const SLOTS = ['FR', 'FL', 'BL', 'BR'];
const U_EDGES = ['UF', 'UR', 'UB', 'UL'];
const U_CORNERS = ['UFR', 'URB', 'UBL', 'ULF'];

/** The cube turned over after the cross: cross colour to the bottom (as on the Learn tab). */
const TURN_OVER = 'x2';

/**
 * The cross is worked out with the cube seen turned over by z2 (cross on the bottom, so the
 * CFOP cross search can be used) and the moves read back in the real hold: under z2, U ↔ D and
 * R ↔ L; F and B stay; x and y turn the other way round, z stays.
 */
const FLIP = 'z2';
const FLIP_FACE: Record<string, string> = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'F', B: 'B', x: 'x', y: 'y', z: 'z' };
export const unflip = (moves: Move[]): Move[] =>
  moves.map((m) => ({ base: FLIP_FACE[m.base], amount: 'xy'.includes(m.base) ? ((4 - m.amount) as 1 | 2 | 3) : m.amount }));

/** A position's name as `whereIs` writes it. */
const pos = (name: string) => positionName(cubie(name));
/** Turn a bottom slot to the front-right, and back. */
const TO_FRONT_RIGHT: Record<string, [string, string]> = {
  [pos('DFR')]: ['', ''],
  [pos('DFL')]: ["y'", 'y'],
  [pos('DBL')]: ['y2', 'y2'],
  [pos('DBR')]: ['y', "y'"],
};

/** Turn a bottom slot to the front-left, and back. */
const TO_FRONT_LEFT: Record<string, [string, string]> = {
  [pos('DFL')]: ['', ''],
  [pos('DFR')]: ['y', "y'"],
  [pos('DBR')]: ['y2', 'y2'],
  [pos('DBL')]: ["y'", 'y'],
};

const word = colorWord;
const names = colorNames;
const times = (n: number) => t('solve.times', { count: n });
const repeat = (alg: string, n: number) => Array(n).fill(alg).join(' ');

/** Colours of the piece that belongs at a named position (by the current centers). */
const homeColors = (st: Stickers, name: string): Color[] => [...name].map((f) => centerColor(st, f as never));
/** Where the piece that belongs at `name` is now, as a position name such as "UFR". */
const whereIs = (st: Stickers, name: string) => positionName(locate(st, cubie(name)));
const solvedAt = (st: Stickers, name: string) => pieceSolved(st, cubie(name));
const uSticker = (st: Stickers, name: string) => st[cubie(name)[0]];

class Builder {
  steps: SolveStep[] = [];
  constructor(
    public st: Stickers,
    private scheme: Record<string, Color>,
    private cross: Color,
  ) {}

  /**
   * One step. `alg` can be given in parts (setup turns, then the algorithm): each part is
   * simplified on its own, so the algorithm still reads the way it is learnt.
   */
  push(stage: string, s: Pick<SolveStep, 'title' | 'caseName' | 'hint'>, alg: string | string[] | Move[], pieces: Color[][] | 'all' | 'eo') {
    const parts = typeof alg === 'string' ? [alg] : alg.length && typeof alg[0] !== 'string' ? [alg as Move[]] : (alg as string[]);
    const m = parts.flatMap((p) => simplifyAlg(typeof p === 'string' ? parseAlg(p) : p));
    const mask: MaskStage =
      pieces === 'all' ? { kind: 'pll', cross: this.cross } : pieces === 'eo' ? { kind: 'eo', cross: this.cross } : { kind: 'pieces', cross: this.cross, pieces };
    this.steps.push({ stage, ...s, alg: formatAlg(m), moves: countMoves(m), mask: stickeringMask(this.scheme, mask) });
    this.st = applyMovesToArray(this.st, m);
  }

  /** Apply without a step of its own (used to try things out). */
  peek(alg: string): Stickers {
    return applyMovesToArray(this.st, alg);
  }
}

function solveFrom(start: Stickers, hold: string, cross: Color, fast = false): SolveStep[] {
  const scheme = Object.fromEntries([...'URFDLB'].map((f, i) => [f, start[i * 9 + 4]]));
  const b = new Builder(start, scheme, cross);
  const held = applyMovesToArray(start, hold);
  // The colour on top after the cube is turned over.
  const top = centerColor(held, 'D');
  const sides = ['F', 'R', 'B', 'L'].map((f) => centerColor(applyMovesToArray(held, TURN_OVER), f as never));
  const crossEdges = sides.map((s) => [cross, s]);
  const corners = sides.map((s, i) => [cross, s, sides[(i + 1) % 4]]);
  const middle = sides.map((s, i) => [s, sides[(i + 1) % 4]]);
  const topEdges = sides.map((s) => [top, s]);
  const firstLayer = [...crossEdges, ...corners];
  const twoLayers = [...firstLayer, ...middle];

  b.push(
    'inspection',
    {
      title: t('beg.holdTitle', { cross: word(cross), front: word(centerColor(held, 'F')) }),
      caseName: hold ? undefined : t('solve.alreadyHeld'),
      hint: t('beg.holdHint', { cross: cap(word(cross)) }),
    },
    hold,
    crossEdges,
  );

  // 1. Cross on top, one edge at a time (the cheapest next edge first), worked out in the
  // flipped view (cross on the bottom) and read back in the real hold.
  const flipped = () => applyMovesToArray(b.st, FLIP);
  const done = crossEdgesDone(flipped());
  const shown = done.map((k) => homeColors(flipped(), CROSS_HOMES[k]));
  if (done.length) {
    b.steps.push({
      stage: 'cross',
      title: t('beg.crossDone', { edges: new Intl.ListFormat(getLocale(), { type: 'unit', style: 'short' }).format(shown.map(names)) }),
      alg: '',
      moves: 0,
      mask: stickeringMask(scheme, { kind: 'pieces', cross, pieces: shown }),
    });
  }
  // Each edge is put in with its spot turned to the front (y), using U, R, F, D, L: no B turns.
  const FRONT: Record<string, string> = { DF: '', DR: 'y', DB: 'y2', DL: "y'" };
  while (crossEdgesDone(flipped()).length < 4) {
    const fl = flipped();
    let best: { y: string; moves: Move[] } | null = null;
    for (const k of [0, 1, 2, 3].filter((k) => !crossEdgesDone(fl).includes(k))) {
      const y = FRONT[CROSS_HOMES[k]];
      const st = applyMovesToArray(fl, y);
      const moves = solveCrossEdge(st, crossEdgesDone(st), 0, true);
      if (!best || moves.length < best.moves.length) best = { y, moves };
    }
    const { y, moves } = best!;
    const colors = homeColors(applyMovesToArray(fl, y), 'DF');
    shown.push(colors);
    const n = shown.length;
    const realY = formatAlg(unflip(parseAlg(y)));
    b.push(
      'cross',
      {
        title: t('beg.crossTitle', { n, edge: names(colors) }),
        hint:
          (realY ? t('beg.turnToCenter', { rotation: realY, color: word(colors[1]) }) : t('beg.centerInFront', { color: word(colors[1]) })) +
          t(n > 1 ? 'beg.bringKeep' : 'beg.bring', { edge: names(colors), cross: word(cross) }),
      },
      [realY, formatAlg(unflip(moves))],
      [...shown],
    );
    // An edge that went in by itself on the way.
    for (const k of crossEdgesDone(flipped())) {
      const c = homeColors(flipped(), CROSS_HOMES[k]);
      if (!shown.some((x) => x[1] === c[1])) shown.push(c);
    }
  }
  if (centerColor(b.st, 'U') !== cross || crossEdgesDone(flipped()).length < 4) throw new Error('Cross on top did not finish (internal error)');

  // Turn the cube over: the cross goes to the bottom for the rest of the solve.
  b.push(
    'cross',
    { title: t('beg.turnOver'), hint: t('beg.turnOverHint', { cross: word(cross), top: word(top) }) },
    TURN_OVER,
    crossEdges,
  );

  // 2. First-layer corners.
  const shownCorners: Color[][] = [];
  for (const slot of SLOTS) if (solvedAt(b.st, `D${slot}`)) shownCorners.push(homeColors(b.st, `D${slot}`));
  for (let k = 0; k < shownCorners.length; k++)
    b.steps.push({
      stage: 'corners',
      title: t('beg.cornerTitle', { n: k + 1, colors: names(shownCorners[k]) }),
      caseName: t('solve.alreadySolved'),
      alg: '',
      moves: 0,
      mask: stickeringMask(scheme, { kind: 'pieces', cross, pieces: [...crossEdges, ...shownCorners.slice(0, k + 1)] }),
    });
  while (shownCorners.length < 4) {
    // Plan each unsolved corner with the right hand (slot at the front-right, R U R' U') and with
    // the left hand (slot at the front-left, L' U' L U), as on the Learn tab; take the shortest.
    // Faster: the shortcuts of the Learn tab's "Go faster" too (take a stuck corner out with
    // either hand, one set less with the cross colour on top, keep a solved middle edge).
    type Plan = { alg: string; colors: Color[]; caseName?: string; hint: string; moves: number; lost: number };
    let best: Plan | null = null;
    // The cross and the corners already in stay solved (in any cube turn: all bottom pieces).
    const bottomSolved = (st: Stickers) => [...CROSS_HOMES, ...SLOTS.map((m) => `D${m}`)].filter((p) => solvedAt(st, p)).length;
    const target = bottomSolved(b.st) + 1;
    const keptAll = (st: Stickers) => bottomSolved(st) >= target;
    const middleSolved = (st: Stickers) => SLOTS.filter((m) => solvedAt(st, m)).length;
    const middleBefore = middleSolved(b.st);
    for (const left of [false, true])
      for (const y of Y) {
        const slot = left ? 'DFL' : 'DFR';
        const edge = left ? 'FL' : 'FR';
        const above = pos(left ? 'UFL' : 'UFR');
        const four = left ? LEFT_SEXY : SEXY;
        const st0 = applyMovesToArray(b.st, y);
        if (solvedAt(st0, slot)) continue;
        const colors = homeColors(st0, slot);
        const slotName = names(colors.slice(1));
        const at = whereIs(st0, slot);
        // Ways to get the corner out of another bottom slot, or none needed.
        const outs: { alg: string; caseName?: string }[] = [];
        if (at[0] === 'D' && at !== pos(slot)) {
          const [there, back] = TO_FRONT_RIGHT[at];
          outs.push({ alg: `${there} R U R' ${back}`, caseName: t('beg.cornerElsewhere') });
          if (fast) {
            const [l, lb] = TO_FRONT_LEFT[at];
            outs.push({ alg: `${l} L' U' L ${lb}`, caseName: t('beg.cornerElsewhereLeft') });
          }
        } else outs.push({ alg: '' });
        for (const out of outs) {
          let alg = `${y} ${out.alg}`;
          let st = applyMovesToArray(b.st, alg);
          let inSlot = false;
          let caseName = out.caseName;
          if (whereIs(st, slot) !== pos(slot)) {
            const u = U_TURNS.find((t) => whereIs(applyMovesToArray(st, t), slot) === above)!;
            alg += ` ${u}`;
            st = applyMovesToArray(st, u);
          } else if (!caseName) {
            // Already in its own slot, only twisted: no U turn, the 4-moves straight away.
            caseName = t('beg.cornerTwisted');
            inSlot = true;
          }
          const tries: { ins: string; caseName?: string; hint: string }[] = [];
          let reps = 0;
          for (let x = st; !solvedAt(x, slot); ) {
            x = applyMovesToArray(x, four);
            if (++reps > 6) throw new Error('First layer: corner not solved (internal error)');
          }
          tries.push({
            ins: repeat(four, reps),
            caseName: caseName ?? (left ? t('beg.cornerLeftHand') : undefined),
            hint: t(`beg.cornerHint${inSlot ? 'Twisted' : ''}${left ? 'Left' : ''}`, { slot: slotName, times: times(reps) }),
          });
          if (fast && !inSlot) {
            const side = left ? 'Left' : '';
            const up = left ? CORNER_UP_FAST_LEFT : CORNER_UP_FAST;
            tries.push({ ins: up, caseName: caseName ?? t('beg.cornerFastUp', { cross: cap(word(cross)) }), hint: t(`beg.cornerHintFastUp${side}`, { slot: slotName, cross: word(cross), alg: up }) });
            if (solvedAt(st, edge))
              for (const k of left ? KEEP_EDGE_LEFT : KEEP_EDGE)
                if (solvedAt(applyMovesToArray(st, k), edge)) tries.push({ ins: k, caseName: caseName ?? t('beg.cornerKeep'), hint: t(`beg.cornerHintKeep${side}`, { slot: slotName, alg: k }) });
          }
          for (const tr of tries) {
            const end = applyMovesToArray(st, tr.ins);
            if (!solvedAt(end, slot) || !keptAll(end)) continue;
            const full = `${alg} ${tr.ins}`;
            const plan: Plan = {
              alg: full,
              colors,
              caseName: tr.caseName,
              hint: tr.hint,
              moves: countMoves(simplifyAlg(parseAlg(full))),
              lost: fast ? Math.max(0, middleBefore - middleSolved(end)) : 0,
            };
            // Fewest solved middle edges knocked out (Faster only), then fewest moves; the right
            // hand and the plain 4-moves on a tie: they are learnt first.
            if (!best || plan.lost < best.lost || (plan.lost === best.lost && plan.moves < best.moves)) best = plan;
          }
        }
      }
    const { alg, colors, caseName, hint } = best!;
    shownCorners.push(colors);
    b.push(
      'corners',
      { title: t('beg.cornerTitle', { n: shownCorners.length, colors: names(colors) }), caseName, hint },
      alg,
      [...crossEdges, ...shownCorners],
    );
  }

  // 3. Middle-layer edges.
  const doneMiddle = () => SLOTS.filter((s) => solvedAt(b.st, s));
  const middleIn = (st: Stickers) => SLOTS.filter((s) => solvedAt(st, s)).map((s) => homeColors(st, s));
  for (let guard = 0; doneMiddle().length < 4; guard++) {
    if (guard > 12) throw new Error('Middle layer did not finish (internal error)');
    let best: { y: string; u: string; right: boolean; colors: Color[] } | null = null;
    for (const y of Y)
      for (const u of U_TURNS) {
        const st = b.peek(`${y} ${u}`);
        const [cu, cf] = cubie('UF').map((i) => st[i]);
        if (cu === top || cf === top || cf !== centerColor(st, 'F')) continue;
        const cand = { y, u, right: cu === centerColor(st, 'R'), colors: [cf, cu] };
        if (!best || (u ? 1 : 0) < (best.u ? 1 : 0)) best = cand;
      }
    const solvedNow = doneMiddle().length;
    if (best) {
      const { y, u, right, colors } = best;
      b.push(
        'middle',
        {
          title: t('beg.middleTitle', { colors: names(colors) }),
          caseName: t(right ? 'beg.goesRight' : 'beg.goesLeft'),
          hint: t(right ? 'beg.middleHintRight' : 'beg.middleHintLeft', { top: word(top), front: word(colors[0]), side: word(colors[1]) }),
        },
        [`${y} ${u}`, right ? MIDDLE_RIGHT : MIDDLE_LEFT],
        [...firstLayer, ...middleIn(b.peek(`${y} ${u} ${right ? MIDDLE_RIGHT : MIDDLE_LEFT}`))],
      );
    } else {
      // Every top edge has the top colour: a middle edge is stuck in the wrong slot or flipped.
      const y = Y.find((r) => !solvedAt(b.peek(r), 'FR'))!;
      b.push(
        'middle',
        {
          title: t('beg.stuckTitle'),
          caseName: t('beg.stuckCase'),
          hint: t('beg.stuckHint'),
        },
        [y, MIDDLE_RIGHT],
        [...firstLayer, ...middleIn(b.peek(`${y} ${MIDDLE_RIGHT}`))],
      );
    }
    if (doneMiddle().length < solvedNow) throw new Error('Middle layer: an edge came out (internal error)');
  }

  // 4. Yellow cross.
  const oriented = (st: Stickers) => U_EDGES.map((e) => uSticker(st, e) === centerColor(st, 'U'));
  for (let guard = 0; oriented(b.st).some((o) => !o); guard++) {
    if (guard > 3) throw new Error('Top cross did not finish (internal error)');
    const o = oriented(b.st);
    const n = o.filter(Boolean).length;
    let u = '';
    let caseName = t('beg.dot');
    let hint = t('beg.dotHint', { top: word(top), alg: YELLOW_CROSS });
    if (n === 2 && o[0] === o[2]) {
      u = o[0] ? 'U' : '';
      caseName = t('beg.line');
      hint = t('beg.lineHint', { top: word(top), alg: YELLOW_CROSS });
    } else if (n === 2) {
      u = U_TURNS.find((t) => {
        const p = oriented(b.peek(t));
        return p[2] && p[3]; // back and left
      })!;
      caseName = t('beg.L');
      hint = t('beg.LHint', { top: word(top), alg: YELLOW_CROSS });
    }
    b.push('top', { title: t('beg.topCross', { top: cap(word(top)) }), caseName, hint }, [u, YELLOW_CROSS], 'eo');
  }

  // 5. Top edges in place (matching the side centers).
  const matched = (st: Stickers) => U_EDGES.map((e) => solvedAt(st, e));
  const bestU = (st: Stickers) => U_TURNS.reduce((a, t) => (matched(applyMovesToArray(st, t)).filter(Boolean).length > matched(applyMovesToArray(st, a)).filter(Boolean).length ? t : a), '');
  const topEdgesShown = [...twoLayers, ...topEdges];
  for (let guard = 0; ; guard++) {
    if (guard > 4) throw new Error('Top edges did not finish (internal error)');
    const u = bestU(b.st);
    const m = matched(b.peek(u));
    if (m.every(Boolean)) {
      if (u) b.push('top', { title: t('beg.topEdges'), caseName: t('beg.lineUp'), hint: t('beg.lineUpHint') }, u, topEdgesShown);
      break;
    }
    // Hold so the alg fixes it in one go when it can.
    const y = Y.find((r) => matched(applyMovesToArray(b.peek(`${u} ${r} ${YELLOW_EDGES}`), bestU(b.peek(`${u} ${r} ${YELLOW_EDGES}`)))).every(Boolean));
    const adjacent = m.filter(Boolean).length === 2 && m[0] !== m[2];
    b.push(
      'top',
      {
        title: t('beg.topEdges'),
        caseName: t(y !== undefined ? (adjacent ? 'beg.adjacent' : 'beg.opposite') : 'beg.oppositeFirst'),
        hint: t(y !== undefined ? 'beg.edgesHint' : 'beg.edgesHintOpposite', { alg: YELLOW_EDGES }),
      },
      [`${u} ${y ?? ''}`, YELLOW_EDGES],
      topEdgesShown,
    );
  }

  // 6. Top corners in place (any twist).
  const placed = (st: Stickers) => U_CORNERS.map((c) => whereIs(st, c) === positionName(cubie(c)));
  for (let guard = 0; placed(b.st).some((p) => !p); guard++) {
    if (guard > 3) throw new Error('Top corners did not finish (internal error)');
    const p = placed(b.st);
    const y = Y.find((r) => placed(b.peek(r))[0]);
    const one = p.some(Boolean);
    b.push(
      'top',
      {
        title: t('beg.cornersPlace'),
        caseName: t(one ? 'beg.oneCorner' : 'beg.noCorner'),
        hint: t(one ? 'beg.oneCornerHint' : 'beg.noCornerHint', { alg: CORNER_CYCLE }),
      },
      [one ? y! : '', CORNER_CYCLE],
      'all',
    );
  }

  // 7. Twist the top corners: R' D' R D at the front-right, U for the next one.
  const twisted = (st: Stickers) => uSticker(st, 'UFR') !== centerColor(st, 'U');
  let corner = 0;
  for (let guard = 0; U_CORNERS.some((c) => uSticker(b.st, c) !== top); guard++) {
    if (guard > 4) throw new Error('Top corners not twisted (internal error)');
    const u = U_TURNS.find((t) => twisted(b.peek(t)))!;
    let st = b.peek(u);
    let reps = 0;
    while (twisted(st)) {
      st = applyMovesToArray(st, CORNER_TWIST);
      if (++reps > 4) throw new Error('Corner twist (internal error)');
    }
    corner++;
    b.push(
      'top',
      {
        title: t('beg.twistTitle', { n: corner }),
        caseName: t('beg.twistCase', { alg: CORNER_TWIST, times: times(reps) }),
        hint: t(u ? 'beg.twistHint' : 'beg.twistHintHere', { alg: CORNER_TWIST, top: word(top), times: times(reps) }),
      },
      [u, repeat(CORNER_TWIST, reps)],
      'all',
    );
  }
  const auf = U_TURNS.find((t) => U_EDGES.every((e) => solvedAt(b.peek(t), e)))!;
  if (auf) b.push('top', { title: t('beg.aufTitle'), hint: t('beg.aufHint') }, auf, 'all');
  if (!U_CORNERS.every((c) => solvedAt(b.st, c)) || !U_EDGES.every((e) => solvedAt(b.st, e)) || !SLOTS.every((s) => solvedAt(b.st, s) && solvedAt(b.st, `D${s}`)))
    throw new Error('Beginner solve did not finish (internal error)');
  return b.steps;
}

export interface BeginnerOptions {
  /** 'faster': the Learn tab's shortcuts for the first-layer corners. */
  corners?: 'standard' | 'faster';
}

export function solveBeginner(state: CubeState, cross: Color, opts: BeginnerOptions = {}): SolvePlan {
  const v = validate(state);
  if (!v.ok) throw new Error(v.errors.join('\n'));
  const start = toColorArray(state);
  let best: SolveStep[] | null = null;
  const total = (s: SolveStep[]) => s.reduce((a, x) => a + x.moves, 0);
  for (const hold of HOLDS) {
    if (centerColor(applyMovesToArray(start, hold), 'U') !== cross) continue;
    const steps = solveFrom(start, hold, cross, opts.corners === 'faster');
    if (!best || total(steps) < total(best)) best = steps;
  }
  return { method: 'Beginner', steps: best!, moves: total(best!), note: t('beg.note', { cross: word(cross) }) };
}

export const BEGINNER: MethodDef = {
  id: 'beginner',
  name: 'Beginner (layer by layer)',
  description: 'Cross on top, turn the cube over, first-layer corners, middle edges, then the top in four short steps with five easy algorithms.',
  settings: [
    {
      key: 'crossColor',
      label: 'Cross colour',
      help: 'The colour you start the cross with, on top. Most guides use white.',
      kind: 'choice',
      options: (['W', 'Y', 'G', 'B', 'R', 'O'] as Color[]).map((c) => ({ value: c, label: { W: 'White', Y: 'Yellow', G: 'Green', B: 'Blue', R: 'Red', O: 'Orange' }[c] })),
    },
    {
      key: 'corners',
      label: 'First-layer corners',
      help: "Standard: R U R' U' (or L' U' L U) repeated until the corner is in. Faster: the shortcuts from Learn → Go faster too: take a stuck corner out with either hand, R U2 R' U' and one 4-moves when the cross colour faces up, and short algorithms that keep a middle edge that is already solved.",
      kind: 'choice',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'faster', label: 'Faster' },
      ],
    },
  ],
  defaults: { crossColor: 'W', corners: 'standard' },
  solve(state: CubeState, s: SettingValues) {
    const c = (Array.isArray(s.crossColor) ? s.crossColor[0] : s.crossColor) as Color;
    return solveBeginner(state, 'WYGBRO'.includes(c) && c ? c : 'W', { corners: s.corners === 'faster' ? 'faster' : 'standard' });
  },
};
