/**
 * Advanced F2L: fewer moves. No cube rotations and no B turns, a pair can go into any slot from
 * where it is, pieces stuck in another open slot are taken out as part of the same algorithm, and
 * every pair order is tried.
 *
 * For each target slot and each set of still-open slots there is a table of the shortest
 * trigger sequence for all 576 places of the pair (corner 8 × 3, edge 12 × 2). Triggers only
 * touch their own slot and the U layer, so solved slots and the cross are never disturbed.
 */
import { type Move, countMoves, invertAlg, movePerm, parseAlg, simplifyAlg, type Perm, applyMovesToArray } from '../../core/cube';
import { CORNERS, EDGES, type Stickers, faceOf, locate } from '../pieces';
import { SLOTS, SLOT_NAMES, SLOT_PIECES, type Slot, slotSolved } from './f2l';

/**
 * Triggers per slot: short sequences that only change one slot and the U layer. They are found by
 * trying every "A X A'" and "A X A' X'" over the finger-trick friendly turns: R, L, F, U and the
 * wide/slice turns r, l, f, S. B turns are never used; the back slots get their edge flips from
 * wide and slice turns instead (for example f R f' or S R S').
 */
const PLAIN = ['R', 'L', 'F', 'U'];
const WIDE = ['r', 'l', 'f', 'S'];
const U_LAYER = new Set([...CORNERS, ...EDGES].filter((c) => c.some((i) => faceOf(i) === 'U')).flat());

function findTriggers(): Record<Slot, string[]> {
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
  // Fewest wide/slice turns first, then shortest: the search keeps the first of equal options.
  const wide = (c: string) => c.split(' ').filter((t) => WIDE.includes(t[0])).length;
  cands.sort((p, q) => wide(p) - wide(q) || p.length - q.length);
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
const SLOT_TRIGGERS = findTriggers();
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
const TRIGS: Record<Slot, Trig[]> = Object.fromEntries(SLOTS.map((s) => [s, SLOT_TRIGGERS[s].map(toTrig)])) as Record<Slot, Trig[]>;
const AUF_TRIGS = AUFS.map(toTrig);

type Table = Map<string, Move[]>;
const tables = new Map<string, Table>();

/** Shortest trigger sequences for the pair of `target`, using triggers of the `open` slots. */
function table(target: Slot, open: Slot[]): Table {
  const id = `${target}:${[...open].sort().join('')}`;
  const cached = tables.get(id);
  if (cached) return cached;
  const trigs = [...AUF_TRIGS, ...open.flatMap((s) => TRIGS[s])];
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
    for (const t of trigs) {
      const nl = locs.map((i) => t.perm[i]);
      const k = nl.join(',');
      if (done.has(k)) continue;
      const p = simplifyAlg([...path, ...t.moves]);
      const cost = countMoves(p);
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
  description: string;
}

/** Where the target pair's pieces are, in words. */
function describe(st: Stickers, slot: Slot, crossWord: string): string {
  const [cHome, eHome] = SLOT_PIECES[slot];
  const where = (home: number[]) => {
    const l = locate(st, home);
    if (l.some((i) => faceOf(i) === 'U')) return 'on top';
    const s = SLOTS.find((x) => l.every((i) => SLOT_PIECES[x].flat().includes(i)))!;
    return s === slot ? 'in its slot' : `in the ${SLOT_NAMES[s]} slot`;
  };
  const c = locate(st, cHome);
  const facing = faceOf(c[0]) === 'U' ? 'up' : faceOf(c[0]) === 'D' ? 'down' : 'to the side';
  return `corner ${where(cHome)} (${crossWord} facing ${facing}), edge ${where(eHome)}`;
}

/** One pair's best solution into `slot`, or null if the table has no entry. */
function pairInto(st: Stickers, slot: Slot, open: Slot[]): Move[] | null {
  const [cHome, eHome] = SLOT_PIECES[slot];
  const key = [...locate(st, cHome), ...locate(st, eHome)].join(',');
  return table(slot, open).get(key) ?? null;
}

/**
 * All four pairs (or the ones left) with the fewest total moves, trying every order.
 * Returns the pairs in solving order.
 */
export function solveF2LAdvanced(st: Stickers, crossWord: string): AdvancedPair[] {
  const search = (s: Stickers, open: Slot[]): { total: number; pairs: AdvancedPair[] } => {
    if (!open.length) return { total: 0, pairs: [] };
    let best: { total: number; pairs: AdvancedPair[] } | null = null;
    for (const slot of open) {
      const alg = pairInto(s, slot, open);
      if (!alg) continue;
      const moves = countMoves(alg);
      if (best && moves >= best.total) continue;
      const next = applyMovesToArray(s, alg);
      const rest = search(next, open.filter((x) => x !== slot));
      const total = moves + rest.total;
      if (!best || total < best.total) {
        best = { total, pairs: [{ slot, alg, moves, description: describe(s, slot, crossWord) }, ...rest.pairs] };
      }
    }
    if (!best) throw new Error('Advanced F2L: no case matched (internal error)');
    return best;
  };
  return search(st, SLOTS.filter((s) => !slotSolved(st, s))).pairs;
}
