/**
 * "Beginner, fewer moves": the second course on the Learn tab. Same cube, same hold (white on
 * the bottom), same steps as the beginner method, but with the short cuts that save the most
 * moves: short corner inserts instead of repeating the corner trick, one D turn for a whole
 * cross, a stuck middle edge popped out by a useful insert, a second yellow-cross algorithm,
 * and twisting corners the short way round.
 *
 * Cases work as in beginner.ts (`end` is where the moves finish; the viewer works out the
 * start). tests/learn.test.ts checks every start looks the way its text says, and that each
 * short cut ends where the beginner version would.
 *
 * Text lives in the translations under `learn.fewer.<lesson>…`.
 */
import { formatAlg, invertAlg, parseAlg } from '../core/cube';
import { type Lesson, FULL_MASK, MIDDLE_LEFT, MIDDLE_RIGHT, YELLOW_CROSS, bright, eoMask, times } from './beginner';

const inverse = (alg: string) => formatAlg(invertAlg(parseAlg(alg)));

export const CROSS_FLIP = "F' D R' D'";
export const CORNER_RIGHT = "R U R'";
export const CORNER_FRONT = "F' U' F";
export const CORNER_UP = "R U2 R' U' R U R'";
export const YELLOW_CROSS_L = "F U R U' R' F'";
/** R' D' R D backwards: twice does what R' D' R D does four times. */
export const TWIST_BACK = "D' R' D R";
const TWIST = "R' D' R D";

export const FEWER: Lesson[] = [
  {
    id: 'habits',
    stage: 'inspection',
    how: 4,
    cases: [],
    mask: FULL_MASK,
  },
  {
    id: 'cross',
    stage: 'cross',
    how: 3,
    textAlg: CROSS_FLIP,
    cases: [
      { id: 'turned', alg: 'D' },
      { id: 'flipped', alg: CROSS_FLIP },
    ],
    mask: bright('cross'),
  },
  {
    id: 'corners',
    stage: 'corners',
    how: 3,
    algs: { right: CORNER_RIGHT, front: CORNER_FRONT, up: CORNER_UP },
    cases: [
      { id: 'right', alg: CORNER_RIGHT },
      { id: 'front', alg: CORNER_FRONT },
      { id: 'up', alg: CORNER_UP },
    ],
    mask: bright('cross', 'corners'),
  },
  {
    id: 'middle',
    stage: 'middle',
    how: 3,
    textAlg: MIDDLE_RIGHT,
    cases: [{ id: 'swap', alg: MIDDLE_RIGHT, end: `${inverse(MIDDLE_LEFT)} U2` }],
    mask: bright('cross', 'corners', 'middle'),
  },
  {
    id: 'ycross',
    stage: 'top',
    how: 3,
    algs: { l: YELLOW_CROSS_L },
    cases: [
      { id: 'l', alg: YELLOW_CROSS_L },
      { id: 'dot', alg: `${YELLOW_CROSS} U2 ${YELLOW_CROSS_L}`, show: `${YELLOW_CROSS} · U2 · ${YELLOW_CROSS_L}` },
    ],
    mask: eoMask,
  },
  {
    id: 'twist',
    stage: 'top',
    how: 3,
    algs: { right: TWIST, front: TWIST_BACK },
    cases: [
      {
        id: 'front',
        alg: `${times(TWIST_BACK, 2)} U ${times(TWIST, 2)} U'`,
        show: `(${TWIST_BACK}) ×2 · U · (${TWIST}) ×2 · U'`,
      },
      {
        id: 'two',
        alg: `${times(TWIST, 2)} U ${times(TWIST_BACK, 2)} U'`,
        show: `(${TWIST}) ×2 · U · (${TWIST_BACK}) ×2 · U'`,
      },
    ],
    mask: FULL_MASK,
  },
];
