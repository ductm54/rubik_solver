/**
 * Advanced F2L: fewer moves. No cube rotations and no B turns, a pair can go into any slot from
 * where it is, pieces stuck in another open slot are taken out as part of the same algorithm,
 * every pair order is tried, and pseudo-slotting (pairs made with the bottom layer turned) is
 * used when it is shorter.
 *
 * For each target slot and each set of still-open slots there is a table of the shortest
 * trigger sequence for all 576 places of the pair (corner 8 × 3, edge 12 × 2). Triggers only
 * touch their own slot and the U layer, so solved slots and the cross are never disturbed.
 */
import { type Color, type Move, countMoves, formatAlg, invertAlg, movePerm, parseAlg, simplifyAlg, type Perm, applyMovesToArray } from '../../core/cube';
import { CORNERS, EDGES, type Stickers, faceOf, homeColor, locate, pieceSolved } from '../pieces';
import { t } from '../../i18n';
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
  /** Colours of the corner and the edge that go in together (cross colour first on the corner). */
  corner: Color[];
  edge: Color[];
  /** True when the corner and the edge belong to different slots (pseudo-slotting). */
  pseudo: boolean;
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
export function describePieces(st: Stickers, slot: Slot, offset: number, crossWord: string): string {
  const cHome = cornerHome(slot, offset);
  const where = (home: number[]) => {
    const l = locate(st, home);
    if (l.some((i) => faceOf(i) === 'U')) return t('f2l.advOnTop');
    const s = SLOTS.find((x) => l.every((i) => SLOT_PIECES[x].flat().includes(i)))!;
    return s === slot ? t('f2l.advInItsSlot') : t('f2l.advInSlot', { slot: t(`slot.${s}`) });
  };
  const c = locate(st, cHome);
  const facing = t(faceOf(c[0]) === 'U' ? 'f2l.facingUp' : faceOf(c[0]) === 'D' ? 'f2l.facingDown' : 'f2l.facingSide');
  return t('f2l.adv', { corner: where(cHome), cross: crossWord, facing, edge: where(SLOT_PIECES[slot][1]) });
}

/** Moves the pair of `slot` would take right now (no pseudo-slotting), or null if the table has no entry. */
export function pairCost(st: Stickers, slot: Slot): number | null {
  const alg = pairInto(st, slot, 0, SLOTS.filter((s) => !slotSolved(st, s)));
  return alg && countMoves(alg);
}

/** One pair's best solution into `slot`, or null if the table has no entry. */
function pairInto(st: Stickers, slot: Slot, offset: number, open: Slot[]): Move[] | null {
  const key = [...locate(st, cornerHome(slot, offset)), ...locate(st, SLOT_PIECES[slot][1])].join(',');
  return table(slot, open).get(key) ?? null;
}

const makePair = (st: Stickers, slot: Slot, offset: number, alg: Move[], description: string): AdvancedPair => ({
  slot,
  alg,
  moves: countMoves(alg),
  description,
  corner: cornerHome(slot, offset).map((i) => homeColor(st, i)),
  edge: SLOT_PIECES[slot][1].map((i) => homeColor(st, i)),
  pseudo: offset !== 0,
});

interface Plan {
  total: number;
  pairs: AdvancedPair[];
}

/** The pairs left at one bottom-layer offset, fewest total moves, trying every order. */
function solveAt(st: Stickers, offset: number, crossWord: string, limit: number): Plan | null {
  const search = (s: Stickers, open: Slot[], limit: number): Plan | null => {
    if (!open.length) return { total: 0, pairs: [] };
    let best: Plan | null = null;
    for (const slot of open) {
      const alg = pairInto(s, slot, offset, open);
      if (!alg) continue;
      const moves = countMoves(alg);
      const room = best ? best.total : limit;
      if (moves >= room) continue;
      const rest = search(applyMovesToArray(s, alg), open.filter((x) => x !== slot), room - moves);
      if (!rest) continue;
      const pair = makePair(s, slot, offset, alg, describePieces(s, slot, offset, crossWord));
      best = { total: moves + rest.total, pairs: [pair, ...rest.pairs] };
    }
    return best;
  };
  return search(st, SLOTS.filter((s) => !placed(st, s, offset)), limit);
}

/**
 * All four pairs (or the ones left) with the fewest total moves, trying every order, with and
 * without pseudo-slotting. Returns the pairs in solving order. With pseudo-slotting the first
 * pair's algorithm starts with the D turn and the last one ends with the turn back; it is only
 * used when it saves moves even with those two turns counted, and only when no pair is solved yet.
 */
export function solveF2LAdvanced(st: Stickers, crossWord: string): AdvancedPair[] {
  let best = solveAt(st, 0, crossWord, Infinity);
  if (!best) throw new Error('Advanced F2L: no case matched (internal error)');
  if (SLOTS.some((s) => slotSolved(st, s))) return best.pairs;
  for (let offset = 1; offset < 4; offset++) {
    const { setup, undo } = OFFSETS[offset];
    const turned = applyMovesToArray(st, setup);
    const plan = solveAt(turned, offset, crossWord, best.total - 2);
    if (!plan) continue;
    // Pseudo pairs that are in place as soon as the bottom layer is turned come first.
    const ready = SLOTS.filter((s) => placed(turned, s, offset)).map((s) =>
      makePair(turned, s, offset, [], t('f2l.advReady')),
    );
    const pairs = [...ready, ...plan.pairs.map((p) => ({ ...p }))];
    const first = pairs[0];
    const last = pairs[pairs.length - 1];
    first.alg = [...setup, ...first.alg];
    first.moves += 1;
    last.alg = [...last.alg, ...undo.moves];
    last.moves += 1;
    best = { total: plan.total + 2, pairs };
  }
  return best.pairs;
}
