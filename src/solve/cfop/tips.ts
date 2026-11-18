/**
 * What a solver looks at before a step, in words: how the cross edges lie, what makes an XCross
 * worth it, and why an F2L pair is taken before the others. Shown on the Learn page under the
 * algorithm (SolveStep.tips).
 */
import { andList, t } from '../../i18n';
import { colorNames, colorWord } from '../mask';
import { type Stickers, centerColor, cubie, faceOf, homeColor, locate, pieceSolved } from '../pieces';
import { SLOTS, SLOT_PIECES, type Slot, slotOf, slotSolved } from './f2l';
import { describePieces } from './f2lAdvanced';

const CROSS_EDGES = ['DF', 'DR', 'DB', 'DL'].map(cubie);
const EDGE_KINDS = ['Home', 'Bottom', 'Middle', 'TopUp', 'Flipped'] as const;
type EdgeKind = (typeof EDGE_KINDS)[number];

export const movesText = (count: number) => t('tip.moves', { count });

/**
 * The cross edges sorted the way they are read in inspection: in place, on the bottom under the
 * wrong centre, in the middle layer, on top facing up (all one turn from the bottom), or flipped.
 */
export function crossTips(st: Stickers, moves: number): string[] {
  const cross = centerColor(st, 'D');
  const name = (h: number[]) => colorNames([cross, homeColor(st, h[1])]);
  const groups: Record<EdgeKind, string[]> = { Home: [], Bottom: [], Middle: [], TopUp: [], Flipped: [] };
  /** Edges lying on the bottom the right way up, by how many places they are from home. */
  const shifted: string[][] = [[], [], [], []];
  CROSS_EDGES.forEach((h, k) => {
    const [a, b] = locate(st, h).map(faceOf);
    const kind: EdgeKind = pieceSolved(st, h) ? 'Home' : a === 'D' ? 'Bottom' : a === 'U' ? 'TopUp' : b === 'U' || b === 'D' ? 'Flipped' : 'Middle';
    groups[kind].push(name(h));
    if (a === 'D') shifted[(CROSS_EDGES.findIndex((x) => x[0] === locate(st, h)[0]) - k + 4) % 4].push(name(h));
  });
  const out = EDGE_KINDS.filter((k) => groups[k].length).map((k) => t(`tip.edge${k}`, { edges: andList(groups[k]), cross: colorWord(cross) }));
  for (const g of shifted.slice(1)) if (g.length > 1) out.push(t('tip.crossRelative', { edges: andList(g) }));
  if (moves) out.push(t('tip.crossPlan', { cross: colorWord(cross), moves: movesText(moves) }));
  return out;
}

/** Corner and edge of a slot sit next to each other with their colours lined up. */
function joined(st: Stickers, slot: Slot): boolean {
  const [corner, edge] = SLOT_PIECES[slot];
  const c = locate(st, corner).map(faceOf);
  const e = locate(st, edge).map(faceOf);
  return c[1] === e[0] && c[2] === e[1];
}

const pairWord = (st: Stickers, slot: Slot) => colorNames(SLOT_PIECES[slot][1].map((i) => homeColor(st, i)));

/** Why the XCross is worth it: where the pairs it solves start, and what they add to the cross. */
export function xcrossTips(st: Stickers, slots: Slot[], crossAlone: number, xcross: number): string[] {
  const cross = colorWord(centerColor(st, 'D'));
  const out: string[] = [];
  for (const s of slots) {
    out.push(t('tip.xPair', { pair: pairWord(st, s), desc: describePieces(st, s, 0, cross) }));
    if (joined(st, s) && !slotSolved(st, s)) out.push(t('tip.xJoined'));
  }
  out.push(t('tip.xCost', { count: xcross - crossAlone, alone: crossAlone, x: xcross }));
  out.push(t('tip.xLook'));
  return out;
}

/** How a pair lies, as far as it matters for picking the next one. */
function pairStatus(st: Stickers, slot: Slot): string {
  const where = SLOT_PIECES[slot].map((p) => slotOf(locate(st, p)));
  if (where.some((s) => s && s !== slot)) return t('tip.stStuck');
  if (where.some((s) => s)) return t('tip.stOwn');
  return t(joined(st, slot) ? 'tip.stJoined' : 'tip.stFree');
}

export interface PairOption {
  slot: Slot;
  /** Face turns. */
  moves: number;
  /** Cube turns on top of them. */
  turns: number;
}

/** The pairs still to do, each with how it lies and what it costs now; the one taken is marked. */
export function orderTips(st: Stickers, options: PairOption[], chosen: Slot): string[] {
  if (options.length < 2) return [t('tip.f2lLast')];
  return options.map((o) => {
    const cost = movesText(o.moves) + (o.turns ? t('tip.plusTurns', { count: o.turns }) : '');
    const line = t('tip.f2lOption', { pair: pairWord(st, o.slot), status: pairStatus(st, o.slot), cost });
    return o.slot === chosen ? t('tip.chosen', { line }) : line;
  });
}

export const openSlots = (st: Stickers) => SLOTS.filter((s) => !slotSolved(st, s));
