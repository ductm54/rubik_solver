/**
 * CFOP: cross, F2L (4 pairs), OLL, PLL, with 2-look or full last layer. With several cross
 * colours allowed, every allowed colour (in all 4 ways of holding it on the bottom) is solved
 * and the best one wins: the shortest, with regrips and B turns in the cross counted as extra
 * moves (see grip.ts), so the cube is held with the side in front that makes the cross easy to do.
 */
import { type Color, type CubeState, type Move, applyMovesToArray, countMoves, formatAlg, parseAlg, simplifyAlg, toColorArray } from '../../core/cube';
import { validate } from '../../core/validate';
import { andList, getLocale, hasKey, t } from '../../i18n';
import { type MaskStage, colorNames, colorWord, stickeringMask } from '../mask';
import { type Stickers, centerColor } from '../pieces';
import type { MethodDef, SettingValues, SolvePlan, SolveStep } from '../types';
import { CPLL, EPLL, PLL } from './algs/pll';
import { type AlgEntry, EO, OCLL, OLL } from './algs/oll';
import { crossDistance, solveCross, solveXCross } from './cross';
import { SLOTS, type Slot, crossSolved, planPair, slotSolved } from './f2l';
import { pairCost, solveF2LAdvanced } from './f2lAdvanced';
import { BACK_TURN_COST, REGRIP_COST, type Thumb, backTurns, planGrip } from './grip';
import { type LLTable, buildTable, matchLL } from './ll';
import { type LLKind, llTips } from './llTips';
import { type PairOption, crossTips, movesText, openSlots, orderTips, xcrossTips } from './tips';

let tables: Record<string, LLTable> | null = null;
function llTables() {
  tables ??= {
    oll: buildTable(OLL, 'orient', false),
    eo: buildTable(EO, 'orientEdges', false),
    ocll: buildTable(OCLL, 'orient', false),
    pll: buildTable(PLL, 'perm', true),
    cpll: buildTable(CPLL, 'permCorners', false),
    epll: buildTable(EPLL, 'perm', true),
  };
  return tables;
}

/** Whole-cube rotations that put each colour on the bottom, 4 per colour. */
const HOLDS = ['', 'x', 'x2', "x'", 'z', "z'"].flatMap((a) => ['', 'y', 'y2', "y'"].map((b) => `${a} ${b}`.trim()));

export interface CfopOptions {
  crossColors: Color[];
  /** Advanced: the cross and at least one F2L pair together (XCross) when that takes under 11 moves. */
  cross?: 'standard' | 'advanced';
  f2l?: 'standard' | 'advanced';
  oll: 'full' | '2look';
  pll: 'full' | '2look';
}

/** The advanced cross does an XCross only when it takes at most this many moves (under 11). */
const XCROSS_MAX = 10;

interface Attempt {
  steps: SolveStep[];
  moves: number;
  color: Color;
  /** How awkward the cross (or XCross) is with the cube held this way, in extra moves: regrips and B turns. */
  effort: number;
}

const thumb = (th: Thumb) => t(`thumb.${th}`);
const hand = (h: 'left' | 'right') => t(`hand.${h}`);
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

function solveFrom(start: Stickers, hold: string, opts: CfopOptions, cross: Color): Attempt {
  const steps: SolveStep[] = [];
  const holdMoves = parseAlg(hold);
  let st = start;
  const scheme = schemeOf(start);
  const held = applyMovesToArray(start, holdMoves);
  const top = colorWord(centerColor(held, 'U'));
  const push = (s: Omit<SolveStep, 'moves' | 'alg' | 'mask'>, moves: Move[], mask: MaskStage) => {
    const m = simplifyAlg(moves);
    steps.push({ ...s, alg: formatAlg(m), moves: countMoves(m), mask: stickeringMask(scheme, mask) });
    st = applyMovesToArray(st, m);
  };

  // Cross, or with the advanced cross an XCross (cross + at least one pair) when it is short enough.
  const xcross = opts.cross === 'advanced' ? solveXCross(held, XCROSS_MAX) : null;
  const crossMoves = xcross ?? solveCross(held);
  const back = backTurns(crossMoves);
  const grip = planGrip(crossMoves);
  // The grip to take during inspection, when it is not the home grip (both thumbs in front).
  const startGrip =
    grip.start.left === grip.start.right
      ? grip.start.left === 'front' ? '' : t('cfop.bothThumbs', { where: thumb(grip.start.left) })
      : andList((['left', 'right'] as const).filter((h) => grip.start[h] !== 'front').map((h) => t('cfop.yourThumb', { hand: hand(h), where: thumb(grip.start[h]) })));

  // Step 0: hold the cube the right way, during the 15 s inspection (rotations only, no moves).
  const front = colorWord(centerColor(held, 'F'));
  const crossName = t(xcross ? 'cfop.xcrossWord' : 'cfop.crossWord');
  push(
    {
      stage: 'inspection',
      title: t('solve.holdTitle', { cross: colorWord(cross), front }),
      caseName: holdMoves.length ? undefined : t('solve.alreadyHeld'),
      hint:
        t('cfop.holdHint', { top, front }) +
        (crossMoves.length
          ? t(crossMoves[0].base === 'B' ? 'cfop.holdHintCrossFirst' : 'cfop.holdHintCross', {
              front,
              crossName,
              regrips: t('cfop.regrips', { count: grip.regrips }),
              backTurns: t('cfop.backTurns', { count: back }),
            })
          : '') +
        (startGrip ? t('cfop.holdHintGrip', { grip: startGrip }) : ''),
    },
    holdMoves,
    { kind: 'cross', cross },
  );
  // Where the regrips are, for the hint of the cross step.
  const regripHint = grip.at
    .map(({ move, hands }) =>
      t('cfop.regripAt', {
        n: move + 1,
        nth: ordinal(move + 1),
        move: formatAlg([crossMoves[move]]),
        hands: new Intl.ListFormat(getLocale(), { type: 'unit', style: 'short' }).format(hands.map((h) => t('cfop.handThumb', { hand: hand(h.hand), where: thumb(h.thumb) }))),
      }),
    )
    .join('');

  if (xcross) {
    const after = applyMovesToArray(held, xcross);
    const done = SLOTS.filter((s) => slotSolved(after, s)).map((s) => slotColors(after, s));
    push(
      {
        stage: 'cross',
        title: t('cfop.xcrossTitle', { count: done.length, cross: colorWord(cross), pairs: andList(done.map(pairName)) }),
        hint: t('cfop.xcrossHint', { count: done.length, cross: colorWord(cross), pairs: andList(done.map(pairName)) }) + regripHint,
        tips: [...crossTips(held, 0), ...xcrossTips(held, SLOTS.filter((s) => slotSolved(after, s)), crossDistance(held), xcross.length)],
      },
      xcross,
      { kind: 'f2l', cross, pairs: done },
    );
  } else {
    push(
      {
        stage: 'cross',
        title: t('cfop.crossTitle', { cross: colorWord(cross) }),
        hint: t('cfop.crossHint', { cross: colorWord(cross) }) + regripHint,
        tips: [...crossTips(held, crossMoves.length), ...(opts.cross === 'advanced' && crossMoves.length ? [t('tip.noXcross', { max: XCROSS_MAX })] : [])],
      },
      crossMoves,
      { kind: 'cross', cross },
    );
  }

  // F2L: greedy, cheapest pair first. Slot names are relative to the current way of holding it.
  const pairs: Color[][] = [];
  for (const s of SLOTS.filter((s) => slotSolved(st, s))) {
    const colors = slotColors(st, s);
    pairs.push(colors);
    steps.push({ stage: 'f2l', title: t('cfop.pairTitle', { n: pairs.length, pair: pairName(colors) }), caseName: t(xcross ? 'cfop.withXcross' : 'cfop.afterCross'), alg: '', moves: 0, mask: stickeringMask(scheme, { kind: 'f2l', cross, pairs: [...pairs] }) });
  }
  if (opts.f2l === 'advanced') {
    const plan = solveF2LAdvanced(st, colorWord(cross));
    const pieces: Color[][] = [];
    const sides = (c: Color[]) => colorNames(c.filter((x) => x !== cross));
    const pseudo = plan.some((p) => p.pseudo);
    const total = plan.reduce((a, p) => a + p.moves, 0);
    plan.forEach((p, k) => {
      // Why this pair now: what each pair left would cost (not with pseudo-slotting, where pairs are mixed).
      const tips = k === 0 ? [t('tip.advOrder', { total: movesText(total) })] : [];
      if (!pseudo) {
        const options: PairOption[] = openSlots(st).map((slot) => ({ slot, moves: slot === p.slot ? p.moves : pairCost(st, slot) ?? 0, turns: 0 }));
        tips.push(...(options.length > 1 ? [t('tip.advPick')] : []), ...orderTips(st, options, p.slot));
        if (options.some((o) => o.moves < p.moves)) tips.push(t('tip.advNotCheapest'));
      }
      pieces.push(p.corner, p.edge);
      const turns = [
        k === 0 ? t('cfop.pseudoFirst', { move: p.alg[0].base === 'D' ? formatAlg([p.alg[0]]) : 'D' }) : '',
        k === plan.length - 1 ? t('cfop.pseudoLast') : '',
      ].filter(Boolean);
      push(
        {
          stage: 'f2l',
          title: p.pseudo
            ? t('cfop.pseudoTitle', { n: pairs.length + k + 1, corner: sides(p.corner), edge: sides(p.edge) })
            : t('cfop.pairTitle', { n: pairs.length + k + 1, pair: sides(p.corner) }),
          caseName: t(p.pseudo ? 'cfop.pseudoInto' : 'cfop.into', { slot: slotName(p.slot) }),
          hint:
            p.pseudo && turns.length
              ? t('cfop.advHintPseudo', { desc: p.description, turns: turns.join(t('cfop.turnsSep')) })
              : t('cfop.advHint', { desc: p.description }),
          tips,
        },
        p.alg,
        { kind: 'f2l', cross, pairs: [...pairs], pieces: [...pieces] },
      );
    });
  } else {
  let first = true;
  while (pairs.length < 4) {
    const done = SLOTS.filter((s) => slotSolved(st, s));
    let best: ReturnType<typeof planPair> = null;
    const options: PairOption[] = [];
    for (const s of SLOTS.filter((s) => !done.includes(s))) {
      const p = planPair(st, s, colorWord(cross));
      if (p) options.push({ slot: s, moves: p.moves, turns: p.cost - p.moves });
      if (p && (!best || p.cost < best.cost)) best = p;
    }
    if (!best) throw new Error('F2L: no case matched (internal error)');
    const tips = [...(options.length > 1 ? [t('tip.f2lPick')] : []), ...orderTips(st, options, best.slot), ...(first ? [t('tip.f2lRule')] : [])];
    first = false;
    const colors = slotColors(st, best.slot);
    pairs.push(colors);
    const moves = [...best.rotation, ...best.extraction, ...best.alg];
    // The pairs solved after this step, by colour (slot names change with the cube turn). Taking a
    // stuck piece out of another slot can, now and then, drop that slot's own pair in as well.
    const after = applyMovesToArray(st, moves);
    const solvedAfter = SLOTS.filter((s) => slotSolved(after, s)).map((s) => slotColors(after, s));
    const key = (c: Color[]) => [...c].sort().join('');
    const bonus = solvedAfter.filter((c) => !pairs.some((p) => key(p) === key(c)));
    if (!pairs.every((p) => solvedAfter.some((c) => key(c) === key(p)))) throw new Error('F2L pair not solved (internal error)');
    const fl = best.side === 'FL';
    push(
      {
        stage: 'f2l',
        title: t('cfop.pairTitle', { n: pairs.length, pair: pairName(colors) }),
        caseName: [
          best.extractedFrom ? t(best.rotation.length ? 'cfop.stuckAfterTurn' : 'cfop.stuck', { slot: slotName(best.extractedFrom) }) : '',
          best.caseId ? `F2L ${best.caseId}` : '',
        ].filter(Boolean).join(' · ') || undefined,
        hint: best.rotation.length
          ? t(fl ? 'cfop.turnToSlotFL' : 'cfop.turnToSlot', { rotation: formatAlg(best.rotation), desc: best.description })
          : t(fl ? 'cfop.slotAtFL' : 'cfop.slotAtFR', { desc: best.description }),
        tips,
      },
      moves,
      { kind: 'f2l', cross, pairs: [...pairs, ...bonus] },
    );
    // A pair that went in along with this one: its own step, with no moves (like a pair solved by the cross).
    const n = pairs.length;
    for (const c of bonus) {
      pairs.push(c);
      steps.push({ stage: 'f2l', title: t('cfop.pairTitle', { n: pairs.length, pair: pairName(c) }), caseName: t('cfop.withPair', { n }), alg: '', moves: 0, mask: stickeringMask(scheme, { kind: 'f2l', cross, pairs: [...pairs] }) });
    }
    if (SLOTS.filter((s) => slotSolved(st, s)).length !== pairs.length) throw new Error('F2L pair not solved (internal error)');
  }
  }
  if (!crossSolved(st) || !SLOTS.every((s) => slotSolved(st, s))) throw new Error('F2L did not finish (internal error)');

  // Last layer
  const llStep = (stage: string, title: string, table: LLTable, mask: MaskStage, skipText: string, kind: string) => {
    const m = matchLL(st, table);
    if (!m) throw new Error(`${title}: no case matched (internal error)`);
    if (!m.entry && !m.count) {
      steps.push({ stage, title, caseName: skipText, alg: '', moves: 0, mask: stickeringMask(scheme, mask) });
      return;
    }
    const name = m.entry ? caseName(kind, m.entry) : t('cfop.aufOnly');
    push(
      { stage, title, caseName: name, hint: m.entry ? caseHint(kind, m.entry, top) : undefined, tips: m.entry ? llTips(st, kind as LLKind, top, name) : undefined },
      m.moves,
      mask,
    );
  };
  const tb = llTables();
  if (opts.oll === 'full') llStep('oll', t('cfop.oll'), tb.oll, { kind: 'oll', cross }, t('cfop.ollSkip'), 'oll');
  else {
    llStep('oll', t('cfop.ollEdges'), tb.eo, { kind: 'eo', cross }, t('cfop.eoSkip', { top }), 'eo');
    llStep('oll', t('cfop.ollCorners'), tb.ocll, { kind: 'oll', cross }, t('cfop.ocllSkip', { top }), 'ocll');
  }
  if (opts.pll === 'full') llStep('pll', t('cfop.pll'), tb.pll, { kind: 'pll', cross }, t('cfop.pllSkip'), 'pll');
  else {
    llStep('pll', t('cfop.pllCorners'), tb.cpll, { kind: 'cpll', cross }, t('cfop.cpllSkip'), 'cpll');
    llStep('pll', t('cfop.pllEdges'), tb.epll, { kind: 'pll', cross }, t('cfop.epllSkip'), 'epll');
  }
  return { steps, moves: steps.reduce((a, s) => a + s.moves, 0), color: cross, effort: REGRIP_COST * grip.regrips + BACK_TURN_COST * back };
}

/** Colours of a slot: [cross colour, front-ish side, right-ish side]. */
function slotColors(st: Stickers, s: Slot): Color[] {
  const sides = [...s] as ('F' | 'B' | 'L' | 'R')[];
  return [centerColor(st, 'D'), ...sides.map((f) => centerColor(st, f))];
}

const pairName = (c: Color[]) => colorNames(c.slice(1));
const slotName = (s: Slot) => t(`slot.${s}`);

/** A last-layer case's name in the current language ("OLL 27 · Sune", "Line", "T-perm"). */
function caseName(kind: string, e: AlgEntry): string {
  if (kind === 'oll') {
    const fam = e.name.replace(/^OLL \S+ · /, '');
    return `OLL ${e.id} · ${hasKey(`oll.fam.${fam}`) ? t(`oll.fam.${fam}`) : fam}`;
  }
  return hasKey(`${kind}.${e.id}.name`) ? t(`${kind}.${e.id}.name`) : e.name;
}

/** How to recognise a case; `{top}` is the top colour. G-perms share one hint. */
function caseHint(kind: string, e: AlgEntry, top: string): string | undefined {
  if (!e.hint) return undefined;
  const key = kind === 'pll' && e.id.startsWith('G') ? 'pll.G.hint' : `${kind}.${e.id}.hint`;
  return (hasKey(key) ? t(key, { top }) : e.hint).replaceAll('{top}', top);
}

function schemeOf(st: Stickers): Record<string, Color> {
  return Object.fromEntries([...'URFDLB'].map((f, i) => [f, st[i * 9 + 4]]));
}

export function solveCfop(state: CubeState, opts: CfopOptions): SolvePlan {
  const v = validate(state);
  if (!v.ok) throw new Error(v.errors.join('\n'));
  const start = toColorArray(state);
  // Every way of holding an allowed colour on the bottom; an awkward cross counts as extra moves.
  const cost = (a: Attempt) => a.moves + a.effort;
  let best: Attempt | null = null;
  for (const hold of HOLDS) {
    const st = applyMovesToArray(start, hold);
    const cross = centerColor(st, 'D');
    if (!opts.crossColors.includes(cross)) continue;
    const a = solveFrom(start, hold, opts, cross);
    if (!best || cost(a) < cost(best) || (cost(a) === cost(best) && a.effort < best.effort)) best = a;
  }
  if (!best) throw new Error(t('cfop.pickColour'));
  const n = opts.crossColors.length;
  return {
    method: 'CFOP',
    steps: best.steps,
    moves: best.moves,
    note: n > 1 ? t('cfop.noteBest', { color: colorWord(best.color), n }) : t('cfop.noteOne', { color: colorWord(best.color) }),
  };
}

const COLOR_OPTIONS: { value: Color; label: string }[] = (['W', 'Y', 'G', 'B', 'R', 'O'] as Color[]).map((c) => ({
  value: c,
  label: { W: 'White', Y: 'Yellow', G: 'Green', B: 'Blue', R: 'Red', O: 'Orange' }[c],
}));

export const CFOP: MethodDef = {
  id: 'cfop',
  name: 'CFOP',
  description: 'Cross, F2L, OLL, PLL: the method most speedcubers use.',
  settings: [
    {
      key: 'crossColors',
      label: 'Cross colours',
      help: 'Start with one. Add more as you learn to solve the cross on them; the solver picks the best for each cube: the shortest solve, held so the cross needs few or no regrips and B turns.',
      kind: 'multi',
      options: COLOR_OPTIONS,
    },
    {
      key: 'cross',
      label: 'Cross',
      help: 'Standard: the shortest cross. Advanced: an XCross, the cross and at least one F2L pair solved together, whenever that takes under 11 moves (otherwise the normal cross).',
      kind: 'choice',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'advanced', label: 'Advanced (XCross)' },
      ],
    },
    {
      key: 'f2l',
      label: 'F2L',
      help: 'Standard: the usual F2L algorithms (most-voted on SpeedCubeDB), one case at a time, with the cube turned so the pair goes in at the front-right or the front-left. Advanced: no cube turns, no B moves (f and S instead), any slot, best pair order, and pseudo-slotting (pairs made with the bottom layer turned) when it is shorter: the fewest moves found.',
      kind: 'choice',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'advanced', label: 'Advanced' },
      ],
    },
    {
      key: 'oll',
      label: 'OLL',
      help: '2-look: 3 + 7 algorithms. Full: 57 algorithms, one step.',
      kind: 'choice',
      options: [
        { value: '2look', label: '2-look' },
        { value: 'full', label: 'Full (57)' },
      ],
    },
    {
      key: 'pll',
      label: 'PLL',
      help: '2-look: 2 + 4 algorithms. Full: 21 algorithms, one step.',
      kind: 'choice',
      options: [
        { value: '2look', label: '2-look' },
        { value: 'full', label: 'Full (21)' },
      ],
    },
  ],
  defaults: { crossColors: ['W'], cross: 'standard', f2l: 'standard', oll: '2look', pll: '2look' },
  solve(state: CubeState, s: SettingValues) {
    const colors = (Array.isArray(s.crossColors) ? s.crossColors : [s.crossColors]) as Color[];
    return solveCfop(state, {
      crossColors: colors.length ? colors : ['W'],
      cross: s.cross === 'advanced' ? 'advanced' : 'standard',
      f2l: s.f2l === 'advanced' ? 'advanced' : 'standard',
      oll: s.oll === 'full' ? 'full' : '2look',
      pll: s.pll === 'full' ? 'full' : '2look',
    });
  },
};
