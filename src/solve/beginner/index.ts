/**
 * Beginner method (layer by layer), the way it is usually taught:
 *   1. cross, one edge at a time
 *   2. first-layer corners: corner above its slot, repeat R U R' U'
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
import { COLOR_WORDS, type MaskStage, stickeringMask } from '../mask';
import { type Stickers, centerColor, cubie, locate, pieceSolved, positionName } from '../pieces';
import type { MethodDef, SettingValues, SolvePlan, SolveStep } from '../types';

const HOLDS = ['', 'x', 'x2', "x'", 'z', "z'"].flatMap((a) => ['', 'y', 'y2', "y'"].map((b) => `${a} ${b}`.trim()));
const Y = ['', 'y', 'y2', "y'"];
const U_TURNS = ['', 'U', 'U2', "U'"];

const SEXY = "R U R' U'";
const MIDDLE_RIGHT = "U R U' R' U' F' U F";
const MIDDLE_LEFT = "U' L' U L U F U' F'";
const YELLOW_CROSS = "F R U R' U' F'";
const YELLOW_EDGES = "R U R' U R U2 R' U";
const CORNER_CYCLE = "U R U' L' U R' U' L";
const CORNER_TWIST = "R' D' R D";

const CROSS_HOMES = ['DF', 'DR', 'DB', 'DL'];
const SLOTS = ['FR', 'FL', 'BL', 'BR'];
const U_EDGES = ['UF', 'UR', 'UB', 'UL'];
const U_CORNERS = ['UFR', 'URB', 'UBL', 'ULF'];

const word = (c: Color) => COLOR_WORDS[c];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const names = (cs: Color[]) => cs.map(word).join('-');
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
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

function solveFrom(start: Stickers, hold: string, cross: Color): SolveStep[] {
  const scheme = Object.fromEntries([...'URFDLB'].map((f, i) => [f, start[i * 9 + 4]]));
  const b = new Builder(start, scheme, cross);
  const held = applyMovesToArray(start, hold);
  const top = centerColor(held, 'U');
  const sides = ['F', 'R', 'B', 'L'].map((f) => centerColor(held, f as never));
  const crossEdges = sides.map((s) => [cross, s]);
  const corners = sides.map((s, i) => [cross, s, sides[(i + 1) % 4]]);
  const middle = sides.map((s, i) => [s, sides[(i + 1) % 4]]);
  const topEdges = sides.map((s) => [top, s]);
  const firstLayer = [...crossEdges, ...corners];
  const twoLayers = [...firstLayer, ...middle];

  b.push(
    'inspection',
    {
      title: `Hold ${word(cross)} on the bottom, ${word(centerColor(held, 'F'))} in front`,
      caseName: hold ? undefined : 'Already held this way: no turn needed',
      hint: `${cap(word(top))} is on top. Keep the cube held this way: the steps say when to turn it.`,
    },
    hold,
    crossEdges,
  );

  // 1. Cross, one edge at a time (the cheapest next edge first).
  const done: number[] = crossEdgesDone(b.st);
  const shown = done.map((k) => homeColors(b.st, CROSS_HOMES[k]));
  if (done.length) {
    b.steps.push({
      stage: 'cross',
      title: `Cross · ${done.map((k) => names(homeColors(b.st, CROSS_HOMES[k]))).join(', ')} already in place`,
      alg: '',
      moves: 0,
      mask: stickeringMask(scheme, { kind: 'pieces', cross, pieces: shown }),
    });
  }
  while (done.length < 4) {
    let best: { k: number; moves: Move[] } | null = null;
    for (const k of [0, 1, 2, 3].filter((k) => !done.includes(k))) {
      const moves = solveCrossEdge(b.st, done, k);
      if (!best || moves.length < best.moves.length) best = { k, moves };
    }
    const { k, moves } = best!;
    const name = CROSS_HOMES[k];
    const colors = homeColors(b.st, name);
    done.push(k);
    shown.push(colors);
    b.push(
      'cross',
      {
        title: `Cross ${done.length}/4 · ${names(colors)} edge`,
        hint: `Bring the ${names(colors)} edge to the bottom, ${word(cross)} facing down, between the ${word(cross)} and ${word(colors[1])} centers${done.length > 1 ? ', without moving the cross edges already in place' : ''}.`,
      },
      moves,
      [...shown],
    );
  }

  // 2. First-layer corners.
  const shownCorners: Color[][] = [];
  for (const slot of SLOTS) if (solvedAt(b.st, `D${slot}`)) shownCorners.push(homeColors(b.st, `D${slot}`));
  for (let k = 0; k < shownCorners.length; k++)
    b.steps.push({
      stage: 'corners',
      title: `Corner ${k + 1}/4 · ${names(shownCorners[k])}`,
      caseName: 'Already solved',
      alg: '',
      moves: 0,
      mask: stickeringMask(scheme, { kind: 'pieces', cross, pieces: [...crossEdges, ...shownCorners.slice(0, k + 1)] }),
    });
  while (shownCorners.length < 4) {
    // Plan each unsolved corner and take the shortest.
    let best: { alg: string; colors: Color[]; caseName?: string; reps: number; moves: number } | null = null;
    for (const y of Y) {
      let alg = y;
      let st = applyMovesToArray(b.st, alg);
      if (solvedAt(st, 'DFR')) continue;
      const colors = homeColors(st, 'DFR');
      let caseName: string | undefined;
      const at = whereIs(st, 'DFR');
      if (at[0] === 'D' && at !== 'DFR') {
        // Stuck in another bottom slot: turn that slot to the front-right, take it out, turn back.
        const [there, back] = ({ DFL: ["y'", 'y'], DBL: ['y2', 'y2'], DBR: ['y', "y'"] } as Record<string, string[]>)[at];
        alg += ` ${there} R U R' ${back}`;
        caseName = 'The corner is in another bottom slot: take it out first (R U R\')';
        st = applyMovesToArray(b.st, alg);
      }
      if (whereIs(st, 'DFR') !== 'DFR') {
        const u = U_TURNS.find((t) => whereIs(applyMovesToArray(st, t), 'DFR') === 'UFR')!;
        alg += ` ${u}`;
        st = applyMovesToArray(st, u);
      } else caseName ??= 'The corner is in its slot but twisted';
      let reps = 0;
      while (!solvedAt(st, 'DFR')) {
        st = applyMovesToArray(st, SEXY);
        if (++reps > 6) throw new Error('First layer: corner not solved (internal error)');
      }
      alg += ` ${repeat(SEXY, reps)}`;
      const moves = countMoves(simplifyAlg(parseAlg(alg)));
      if (!best || moves < best.moves) best = { alg, colors, caseName, reps, moves };
    }
    const { alg, colors, caseName, reps } = best!;
    shownCorners.push(colors);
    b.push(
      'corners',
      {
        title: `Corner ${shownCorners.length}/4 · ${names(colors)}`,
        caseName,
        hint: `Turn the cube so the ${names(colors.slice(1))} slot is at the front-right, bottom. Turn U until the corner is right above it (top front-right), then repeat R U R' U' until it is solved: here ${times(reps)}.`,
      },
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
          title: `Middle edge · ${names(colors)}`,
          caseName: right ? 'Goes to the right' : 'Goes to the left',
          hint: `Find a top edge with no ${word(top)}. Turn U and the cube so its front sticker matches the front center (${word(colors[0])}): it makes an upside-down T. Its top sticker (${word(colors[1])}) matches the ${right ? 'right' : 'left'} center, so do the ${right ? 'right' : 'left'} algorithm.`,
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
          title: 'Middle edge · take a stuck edge out',
          caseName: 'No top edge without the top colour',
          hint: `An edge is in the wrong middle slot or flipped. Turn the cube so that slot is at the front-right and do the right algorithm: it puts a top edge in and brings the stuck edge up.`,
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
    let caseName = 'Dot: no top edge done';
    let hint = `Only the center shows ${word(top)} among the edges. Do ${YELLOW_CROSS} from any side: it makes an L.`;
    if (n === 2 && o[0] === o[2]) {
      u = o[0] ? 'U' : '';
      caseName = 'Line';
      hint = `A ${word(top)} line: turn U so it goes left to right, then ${YELLOW_CROSS} makes the cross.`;
    } else if (n === 2) {
      u = U_TURNS.find((t) => {
        const p = oriented(b.peek(t));
        return p[2] && p[3]; // back and left
      })!;
      caseName = 'L shape';
      hint = `A ${word(top)} L: turn U so its two arms point to the back and the left, then ${YELLOW_CROSS} makes a line.`;
    }
    b.push('top', { title: `${cap(word(top))} cross`, caseName, hint }, [u, YELLOW_CROSS], 'eo');
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
      if (u) b.push('top', { title: 'Top edges in place', caseName: 'Line them up', hint: `Turn U so all four top edges match their side centers.` }, u, topEdgesShown);
      break;
    }
    // Hold so the alg fixes it in one go when it can.
    const y = Y.find((r) => matched(applyMovesToArray(b.peek(`${u} ${r} ${YELLOW_EDGES}`), bestU(b.peek(`${u} ${r} ${YELLOW_EDGES}`)))).every(Boolean));
    const adjacent = m.filter(Boolean).length === 2 && m[0] !== m[2];
    b.push(
      'top',
      {
        title: 'Top edges in place',
        caseName: y !== undefined ? (adjacent ? 'Two next to each other match' : 'Two opposite edges match') : 'Two opposite edges match: first make them neighbours',
        hint:
          y !== undefined
            ? `Turn U so two top edges match their side centers, then turn the cube so they are at the back and the right, and do ${YELLOW_EDGES}. It swaps the front and left edges.`
            : `Turn U so two opposite top edges match their side centers, do ${YELLOW_EDGES} from any side: then two neighbouring edges match.`,
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
        title: 'Top corners in place',
        caseName: one ? 'One corner in place' : 'No corner in place',
        hint: one
          ? `A corner is in place when it has the colours of its three centers (twisted is fine). Turn the cube so it is at the front-right, then ${CORNER_CYCLE} cycles the other three.`
          : `No corner has the colours of its three centers yet: do ${CORNER_CYCLE} once from any side, then one will.`,
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
        title: `Twist corner ${corner}`,
        caseName: `${CORNER_TWIST} ${times(reps)}`,
        hint: `${u ? 'Turn only U (not the cube) so a twisted corner is at the top front-right. ' : 'A twisted corner is at the top front-right. '}Repeat ${CORNER_TWIST} until ${word(top)} is on top: here ${times(reps)}. The bottom looks scrambled for a while: it comes back when the last corner is done.`,
      },
      [u, repeat(CORNER_TWIST, reps)],
      'all',
    );
  }
  const auf = U_TURNS.find((t) => U_EDGES.every((e) => solvedAt(b.peek(t), e)))!;
  if (auf) b.push('top', { title: 'Line up the top layer', hint: 'Turn U so the top layer matches the rest: solved.' }, auf, 'all');
  if (!U_CORNERS.every((c) => solvedAt(b.st, c)) || !U_EDGES.every((e) => solvedAt(b.st, e)) || !SLOTS.every((s) => solvedAt(b.st, s) && solvedAt(b.st, `D${s}`)))
    throw new Error('Beginner solve did not finish (internal error)');
  return b.steps;
}

export function solveBeginner(state: CubeState, cross: Color): SolvePlan {
  const v = validate(state);
  if (!v.ok) throw new Error(v.errors.join('\n'));
  const start = toColorArray(state);
  let best: SolveStep[] | null = null;
  const total = (s: SolveStep[]) => s.reduce((a, x) => a + x.moves, 0);
  for (const hold of HOLDS) {
    if (centerColor(applyMovesToArray(start, hold), 'D') !== cross) continue;
    const steps = solveFrom(start, hold, cross);
    if (!best || total(steps) < total(best)) best = steps;
  }
  return { method: 'Beginner', steps: best!, moves: total(best!), note: `Layer by layer, ${word(cross)} cross on the bottom.` };
}

export const BEGINNER: MethodDef = {
  id: 'beginner',
  name: 'Beginner (layer by layer)',
  description: 'Cross, first-layer corners, middle edges, then the top in four short steps with five easy algorithms.',
  settings: [
    {
      key: 'crossColor',
      label: 'Cross colour',
      help: 'The colour you start with, on the bottom. Most guides use white.',
      kind: 'choice',
      options: (['W', 'Y', 'G', 'B', 'R', 'O'] as Color[]).map((c) => ({ value: c, label: word(c)[0].toUpperCase() + word(c).slice(1) })),
    },
  ],
  defaults: { crossColor: 'W' },
  solve(state: CubeState, s: SettingValues) {
    const c = (Array.isArray(s.crossColor) ? s.crossColor[0] : s.crossColor) as Color;
    return solveBeginner(state, 'WYGBRO'.includes(c) && c ? c : 'W');
  },
};
