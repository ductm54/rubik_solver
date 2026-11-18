/**
 * Advanced F2L: the plan quickest to turn (moves weighted by finger trick, see moveCost.ts). No
 * cube rotations and no B turns, a pair can go into any slot from
 * where it is, pieces stuck in another open slot are taken out as part of the same algorithm,
 * every pair order is tried, and pseudo-slotting (pairs made with the bottom layer turned) and
 * u turns (a corner with another slot's edge, inside "u … u'") are used when they are shorter.
 *
 * For each target slot and each set of still-open slots there is a table of the shortest
 * trigger sequence for all 576 places of the pair (corner 8 × 3, edge 12 × 2). Triggers only
 * touch their own slot and the U layer, so solved slots and the cross are never disturbed.
 */
import { type Color, type Move, countMoves, formatAlg, invertAlg, movePerm, parseAlg, simplifyAlg, type Perm, applyMovesToArray } from '../../core/cube';
import { CORNERS, EDGES, type Stickers, faceOf, homeColor, locate, pieceSolved } from '../pieces';
import { t } from '../../i18n';
import { type F2LMetric, metricCost, turnCost } from './moveCost';
import { SLOTS, SLOT_PIECES, type Slot, slotSolved } from './f2l';

/**
 * Triggers per slot: short sequences that only change one slot and the U layer. They are found by
 * trying every "A X A'" and "A X A' X'" over the finger-trick friendly turns: R, L, F, U and the
 * wide/slice turns r, l, f, S. B turns are never used; the back slots get their edge flips from
 * wide and slice turns instead (for example f R f' or S R S').
 */
const PLAIN = ['R', 'L', 'F', 'U'];
const WIDE = ['r', 'l', 'f', 'S'];
const U_LAYER = new Set([...CORNERS, ...EDGES].filter((c) => c.some((i) => faceOf(i) === 'U')).flat());

function findTriggers(metric: F2LMetric): Record<Slot, string[]> {
  const turns = [...PLAIN, ...WIDE].flatMap((b) => [b, `${b}'`, `${b}2`]);
  const inv = (t: string) => (t.endsWith("'") ? t[0] : t.endsWith('2') ? t : `${t}'`);
  const cands: string[] = [];
  for (const a of turns) {
    if (a[0] === 'U') continue;
    for (const x of turns) {
      if (x[0] === a[0]) continue;
      cands.push(`${a} ${x} ${inv(a)}`);
      if (!a.endsWith('2') && !x.endsWith('2')) cands.push(`${a} ${x} ${inv(a)} ${inv(x)}`);
    }
  }
  // Of triggers that do the same thing only the first is kept: by move count, fewest wide/slice
  // turns first, then shortest; by time, the quickest to turn.
  const wide = (c: string) => c.split(' ').filter((t) => WIDE.includes(t[0])).length;
  const time = (c: string) => metricCost('time', parseAlg(c));
  cands.sort((p, q) => (metric === 'time' ? time(p) - time(q) : 0) || wide(p) - wide(q) || p.length - q.length);
  const out = Object.fromEntries(SLOTS.map((s) => [s, [] as string[]])) as Record<Slot, string[]>;
  const seen = new Set<string>();
  for (const c of cands) {
    const perm = applyMovesToArray(Array.from({ length: 54 }, (_, i) => i), c);
    const moved = perm.map((v, i) => (v === i ? -1 : i)).filter((i) => i >= 0 && !U_LAYER.has(i));
    if (!moved.length) continue;
    const slot = SLOTS.find((s) => moved.every((i) => SLOT_PIECES[s].flat().includes(i)));
    const key = perm.join(',');
    if (!slot || seen.has(key)) continue;
    seen.add(key);
    out[slot].push(c);
  }
  return out;
}
const AUFS = ['U', "U'", 'U2'];

interface Trig {
  moves: Move[];
  perm: Perm; // sticker at i goes to perm[i]
}
const toTrig = (alg: string): Trig => {
  const moves = parseAlg(alg);
  let perm = Array.from({ length: 54 }, (_, i) => i);
  for (const m of moves) {
    const p = movePerm(m);
    perm = perm.map((i) => p[i]);
  }
  return { moves, perm };
};
const trigCache = new Map<F2LMetric, Record<Slot, Trig[]>>();
function trigs(metric: F2LMetric): Record<Slot, Trig[]> {
  let out = trigCache.get(metric);
  if (!out) {
    const found = findTriggers(metric);
    out = Object.fromEntries(SLOTS.map((s) => [s, found[s].map(toTrig)])) as Record<Slot, Trig[]>;
    trigCache.set(metric, out);
  }
  return out;
}
const AUF_TRIGS = AUFS.map(toTrig);

type Table = Map<string, Move[]>;
const tables = new Map<string, Table>();

/** Cheapest trigger sequences for the pair of `target`, using triggers of the `open` slots. */
function table(target: Slot, open: Slot[], metric: F2LMetric): Table {
  const id = `${metric}:${target}:${[...open].sort().join('')}`;
  const cached = tables.get(id);
  if (cached) return cached;
  const options = [...AUF_TRIGS, ...open.flatMap((s) => trigs(metric)[s])];
  const start = SLOT_PIECES[target].flat(); // corner facelets then edge facelets
  const best = new Map<string, { cost: number; path: Move[]; locs: number[] }>();
  best.set(start.join(','), { cost: 0, path: [], locs: start });
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    let curCost = Infinity;
    for (const [k, v] of best) if (!done.has(k) && v.cost < curCost) (cur = k), (curCost = v.cost);
    if (cur === null) break;
    done.add(cur);
    const { path, locs } = best.get(cur)!;
    for (const t of options) {
      const nl = locs.map((i) => t.perm[i]);
      const k = nl.join(',');
      if (done.has(k)) continue;
      const p = simplifyAlg([...path, ...t.moves]);
      const cost = metricCost(metric, p);
      const old = best.get(k);
      if (!old || cost < old.cost) best.set(k, { cost, path: p, locs: nl });
    }
  }
  const out: Table = new Map();
  for (const [k, v] of best) out.set(k, simplifyAlg(invertAlg(v.path)));
  tables.set(id, out);
  return out;
}

export interface AdvancedPair {
  slot: Slot;
  alg: Move[];
  moves: number;
  /** Execution time in fast moves (R or U = 1), see moveCost.ts. */
  time: number;
  /** What the search minimised for this pair (see metricCost). */
  cost: number;
  description: string;
  /** Colours of the corner and the edge that go in together (cross colour first on the corner). */
  corner: Color[];
  edge: Color[];
  /** True when the plan turns the bottom layer (pseudo-slotting): corners go in with other slots' edges. */
  pseudo: boolean;
  /** True when this pair goes in inside "u … u'", the corner with the edge of another slot. */
  uTurn: boolean;
}

/**
 * Pseudo-slotting: with the bottom layer turned by D, D2 or D', the corner that sits under a slot
 * is not the one of that slot, so a corner can be paired with the edge of another slot and the
 * two go in together. Turning the bottom layer back at the end puts every corner under its own
 * edge. `offset` is the number of D quarter turns the bottom layer is ahead (0 = normal F2L).
 */
const OFFSETS = ['', 'D', 'D2', "D'"].map((d) => ({ setup: parseAlg(d), undo: toTrig(formatAlg(invertAlg(parseAlg(d)))) }));

/** Facelets where the corner that has to go under `slot` is at home, for a bottom-layer offset. */
const cornerHome = (slot: Slot, offset: number) => SLOT_PIECES[slot][0].map((i) => OFFSETS[offset].undo.perm[i]);

const placed = (st: Stickers, slot: Slot, offset: number) =>
  pieceSolved(st, SLOT_PIECES[slot][1]) && locate(st, cornerHome(slot, offset)).every((l, k) => l === SLOT_PIECES[slot][0][k]);

/** Where the pair's pieces are, in words. */
export function describePieces(st: Stickers, slot: Slot, offset: number, crossWord: string, k = 0): string {
  const cHome = cornerHome(slot, offset);
  const where = (home: number[], own: Slot) => {
    const l = locate(st, home);
    if (l.some((i) => faceOf(i) === 'U')) return t('f2l.advOnTop');
    const s = SLOTS.find((x) => l.every((i) => SLOT_PIECES[x].flat().includes(i)))!;
    return s === own ? t('f2l.advInItsSlot') : t('f2l.advInSlot', { slot: t(`slot.${s}`) });
  };
  const c = locate(st, cHome);
  const facing = t(faceOf(c[0]) === 'U' ? 'f2l.facingUp' : faceOf(c[0]) === 'D' ? 'f2l.facingDown' : 'f2l.facingSide');
  return t('f2l.adv', { corner: where(cHome, slot), cross: crossWord, facing, edge: where(edgeHome(slot, k), slotOfEdge(edgeHome(slot, k))) });
}

/**
 * What the pair of `slot` would take right now (no pseudo-slotting or u turns): its moves and its
 * search cost, or null if the table has no entry.
 */
export function pairCost(st: Stickers, slot: Slot, metric: F2LMetric = 'time'): { moves: number; cost: number } | null {
  const key = [...locate(st, SLOT_PIECES[slot][0]), ...locate(st, SLOT_PIECES[slot][1])].join(',');
  const alg = table(slot, SLOTS.filter((s) => !slotSolved(st, s)), metric).get(key);
  return alg ? { moves: countMoves(alg), cost: metricCost(metric, alg) } : null;
}

const makePair = (st: Stickers, slot: Slot, offset: number, k: number, alg: Move[], description: string, metric: F2LMetric): AdvancedPair => ({
  slot,
  alg,
  moves: countMoves(alg),
  time: turnCost(alg),
  cost: metricCost(metric, alg),
  description,
  corner: cornerHome(slot, offset).map((i) => homeColor(st, i)),
  edge: edgeHome(slot, k).map((i) => homeColor(st, i)),
  pseudo: offset !== 0,
  uTurn: k !== 0,
});

interface Plan {
  total: number;
  pairs: AdvancedPair[];
}

/**
 * u-slotting: turning the top two layers (u, u2 or u') moves the middle-layer edges over other
 * corners, so a corner can go in with the edge of another slot inside "u … u'" without touching
 * the solved slots (u only moves the U layer and the middle layer, and turns back at the end).
 * `U_FRAMES[k]` is the turn for k quarter turns (0 = none) and the turn back.
 */
const U_FRAMES = ['', 'u', 'u2', "u'"].map((m) => ({ setup: toTrig(m), undo: toTrig(formatAlg(invertAlg(parseAlg(m)))) }));

/** Facelets where the edge that goes in with the corner of `slot` is at home, in u-frame `k`. */
const edgeHome = (slot: Slot, k: number) => SLOT_PIECES[slot][1].map((i) => U_FRAMES[k].undo.perm[i]);
const slotOfEdge = (home: number[]) => SLOTS.find((x) => home.every((i) => SLOT_PIECES[x][1].includes(i)))!;

/** The pairs left at one bottom-layer offset, cheapest in total, trying every order and u-frame. */
function solveAt(st: Stickers, offset: number, crossWord: string, limit: number, metric: F2LMetric, needTwo = false): Plan | null {
  // `corners`: slots whose corner is still to go in; `edges`: slots whose edge is still to go in.
  // `two`: some step already put two pairs in at once (the next pair then needs no moves).
  const search = (s: Stickers, corners: Slot[], edges: Slot[], limit: number, two: boolean): Plan | null => {
    if (!corners.length) return needTwo && !two ? null : { total: 0, pairs: [] };
    let best: Plan | null = null;
    for (let k = 0; k < U_FRAMES.length; k++) {
      const { setup, undo } = U_FRAMES[k];
      // Slots whose triggers are safe in this frame: their corner and the edge over it are both open.
      const open = corners.filter((x) => edges.includes(slotOfEdge(edgeHome(x, k))));
      for (const slot of open) {
        const eHome = edgeHome(slot, k);
        const key = [...locate(s, cornerHome(slot, offset)), ...locate(s, eHome)].map((i) => setup.perm[i]).join(',');
        const inner = table(slot, open, metric).get(key);
        // Already in place with u: nothing to show as a step, the plain frame handles it.
        if (!inner || (k && !inner.length)) continue;
        const alg = simplifyAlg([...setup.moves, ...inner, ...undo.moves]);
        const cost = metricCost(metric, alg);
        const room = best ? best.total : limit;
        if (cost >= room) continue;
        const edge = slotOfEdge(eHome);
        const rest = search(applyMovesToArray(s, alg), corners.filter((x) => x !== slot), edges.filter((x) => x !== edge), room - cost, two || !alg.length);
        if (!rest) continue;
        const pair = makePair(s, slot, offset, k, alg, describePieces(s, slot, offset, crossWord, k), metric);
        best = { total: cost + rest.total, pairs: [pair, ...rest.pairs] };
      }
    }
    return best;
  };
  const open = SLOTS.filter((s) => !placed(st, s, offset));
  // A pair already in place (only possible here with the bottom layer turned) counts as two at once.
  return search(st, open, open, limit, open.length < SLOTS.length);
}

/**
 * All four pairs (or the ones left) with the least total cost (execution time, or moves), trying
 * every order, with and without pseudo-slotting. Returns the pairs in solving order. With
 * pseudo-slotting the first pair's algorithm starts with the D turn and the last one ends with the
 * turn back; it is only used when it is cheaper even with those two turns counted, only when no
 * pair is solved yet, and only when the turned bottom layer lets two pairs go in at once: a pair
 * is in place as soon as the bottom layer is turned, or one algorithm puts two pairs in. Turning
 * the bottom layer just to save a move or two on separate pairs is not worth the confusion.
 */
export function solveF2LAdvanced(st: Stickers, crossWord: string, metric: F2LMetric = 'time'): AdvancedPair[] {
  let best = solveAt(st, 0, crossWord, Infinity, metric);
  if (!best) throw new Error('Advanced F2L: no case matched (internal error)');
  if (SLOTS.some((s) => slotSolved(st, s))) return best.pairs;
  for (let offset = 1; offset < 4; offset++) {
    const { setup, undo } = OFFSETS[offset];
    const turned = applyMovesToArray(st, setup);
    const turns = metricCost(metric, setup) + metricCost(metric, undo.moves);
    const plan = solveAt(turned, offset, crossWord, best.total - turns, metric, true);
    if (!plan) continue;
    // Pseudo pairs that are in place as soon as the bottom layer is turned come first.
    const ready = SLOTS.filter((s) => placed(turned, s, offset)).map((s) =>
      makePair(turned, s, offset, 0, [], t('f2l.advReady'), metric),
    );
    const pairs = [...ready, ...plan.pairs.map((p) => ({ ...p }))];
    const first = pairs[0];
    const last = pairs[pairs.length - 1];
    const redo = (p: AdvancedPair, alg: Move[]) => Object.assign(p, { alg, moves: countMoves(alg), time: turnCost(alg), cost: metricCost(metric, alg) });
    redo(first, [...setup, ...first.alg]);
    redo(last, [...last.alg, ...undo.moves]);
    best = { total: plan.total + turns, pairs };
  }
  return best.pairs;
}
