/**
 * Level 3 of the Learn tab: an introduction to CFOP. One lesson shows the method's four stages
 * (Cross, F2L, OLL, PLL) on one example solve, a stage per demo button, held like the beginner
 * method's middle steps: white on the bottom, yellow on top.
 *
 * The example is built backwards from the stage moves, so each stage's demo starts exactly where
 * the one before ends. tests/learn.test.ts checks every stage starts unsolved and ends solved.
 */
import { type Color, STANDARD_SCHEME, formatAlg, invertAlg, parseAlg } from '../core/cube';
import { stickeringMask } from '../solve/mask';
import { FULL_MASK, type Lesson, type LessonCase } from './beginner';

const SIDES: Color[] = ['G', 'R', 'B', 'O'];
const SLOTS = SIDES.map((s, i) => ['W', s, SIDES[(i + 1) % 4]] as Color[]);

/** The example's stages, read with white on the bottom and yellow on top. */
export const CFOP_CROSS = "D R' F2 D2 L";
/** One pair per slot, each built in the top layer and put in with a 3- or 4-move insert. */
export const CFOP_PAIRS = ["U R U' R'", "U' L' U L", "R' U2 R", "L U L'"];
export const CFOP_OLL = "R U R' U R U2 R'";
export const CFOP_PLL = "R U R' U' R' F R2 U' R' U' R U R' F'";

const STAGES = [CFOP_CROSS, CFOP_PAIRS.join(' '), CFOP_OLL, CFOP_PLL];
/** The moves left after stage `i`. */
const rest = (i: number) => STAGES.slice(i + 1).join(' ');
const invert = (alg: string) => formatAlg(invertAlg(parseAlg(alg)));

const mask = (kind: 'cross' | 'oll') => stickeringMask(STANDARD_SCHEME, { kind, cross: 'W' });
const F2L_MASK = stickeringMask(STANDARD_SCHEME, { kind: 'f2l', cross: 'W', pairs: SLOTS });

const stage = (id: string, i: number, mask: string, show?: string): LessonCase => ({
  id,
  alg: STAGES[i],
  show,
  end: invert(rest(i)),
  mask,
});

export const CFOP_INTRO: Lesson[] = [
  {
    id: 'cfop',
    stage: 'inspection',
    how: 4,
    cases: [
      stage('cross', 0, mask('cross')),
      stage('f2l', 1, F2L_MASK, CFOP_PAIRS.join(' · ')),
      stage('oll', 2, mask('oll')),
      stage('pll', 3, FULL_MASK),
      { id: 'all', alg: STAGES.join(' '), show: STAGES.slice(0, 1).concat(CFOP_PAIRS, STAGES.slice(2)).join(' · '), mask: FULL_MASK },
    ],
    mask: FULL_MASK,
  },
];
