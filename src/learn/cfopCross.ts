/**
 * Level 4 of the Learn tab: the CFOP cross, made straight on the bottom (white down, no turning
 * the cube over as in the beginner method). Each case puts one edge, the one that belongs at the
 * front-bottom, in place from somewhere else, keeping the other cross edges.
 *
 * Demos start from the moves undone on a solved cube, so only that edge is out among the cross
 * edges. tests/learn.test.ts checks every start is where its text puts the edge.
 */
import { STANDARD_SCHEME } from '../core/cube';
import { stickeringMask } from '../solve/mask';
import type { Lesson } from './beginner';

const MASK = stickeringMask(STANDARD_SCHEME, { kind: 'cross', cross: 'W' });

export const CROSS_LESSONS: Lesson[] = [
  {
    id: 'crossDown',
    stage: 'cross',
    how: 3,
    textAlg: 'F2',
    cases: [
      { id: 'top', alg: 'F2' },
      { id: 'side', alg: 'F' },
      { id: 'sideFront', alg: "D R' D'", show: "D · R' · D'" },
    ],
    mask: MASK,
  },
  {
    id: 'crossFix',
    stage: 'cross',
    how: 3,
    textAlg: "U' R' F R",
    cases: [
      { id: 'topFlipped', alg: "U' R' F R", show: "U' · R' F R" },
      { id: 'bottomFlipped', alg: "F' D R' D'", show: "F' · D R' D'" },
      { id: 'bottomWrong', alg: 'R2 U F2', show: 'R2 · U · F2' },
    ],
    mask: MASK,
  },
  {
    id: 'crossPlan',
    stage: 'cross',
    how: 4,
    textAlg: 'D',
    cases: [{ id: 'order', alg: 'F2 D', show: 'F2 · D' }],
    mask: MASK,
  },
];
