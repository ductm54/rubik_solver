/**
 * Level 5 of the Learn tab: intuitive F2L. The corner and edge of one slot are joined into a
 * pair in the top layer and put in together, held like CFOP: white cross on the bottom, the slot
 * being solved at the front-right. Every case is one of SpeedCubeDB's 41 F2L cases
 * (solve/cfop/algs/f2l.ts), with its number in `F2L_CASE_IDS`, so the solver and the course agree.
 *
 * As in the beginner course, a case's demo starts from the moves undone on a solved cube, so the
 * cross and the other three slots are solved and only the front-right pair is out.
 * tests/learn.test.ts checks every start is where its text puts the corner and the edge.
 */
import { type Color, STANDARD_SCHEME } from '../core/cube';
import { stickeringMask } from '../solve/mask';
import type { Lesson } from './beginner';

/**
 * Held with white on the bottom (x2 from the viewer's white top, green front), blue is in front
 * and red on the right: the front-right slot is the white-blue-red corner and the blue-red edge.
 */
export const FR_PAIR: Color[] = ['W', 'B', 'R'];
const MASK = stickeringMask(STANDARD_SCHEME, { kind: 'f2l', cross: 'W', pairs: [FR_PAIR] });

/** The basic inserts: the pair is ready in the top layer. */
export const INSERT_RIGHT = "R U R'";
export const INSERT_FRONT = "F' U' F";
export const INSERT_JOINED = "U R U' R'";
export const INSERT_JOINED_FRONT = "U' F' U F";

/** SpeedCubeDB case number of each lesson case. */
export const F2L_CASE_IDS: Record<string, string> = {
  'f2lInsert.right': '4',
  'f2lInsert.front': '3',
  'f2lInsert.joined': '1',
  'f2lInsert.joinedFront': '2',
  'f2lPair.apart': '5',
  'f2lPair.wrong': '14',
  'f2lPair.up': '17',
  'f2lStuck.corner': '30',
  'f2lStuck.edge': '33',
  'f2lStuck.flipped': '35',
};

export const F2L_LESSONS: Lesson[] = [
  {
    id: 'f2lInsert',
    stage: 'corners',
    how: 3,
    algs: { right: INSERT_RIGHT, front: INSERT_FRONT, joined: INSERT_JOINED, joinedFront: INSERT_JOINED_FRONT },
    cases: [
      { id: 'right', alg: INSERT_RIGHT },
      { id: 'front', alg: INSERT_FRONT },
      { id: 'joined', alg: INSERT_JOINED, show: "U · R U' R'" },
      { id: 'joinedFront', alg: INSERT_JOINED_FRONT, show: "U' · F' U F" },
    ],
    mask: MASK,
  },
  {
    id: 'f2lPair',
    stage: 'corners',
    how: 3,
    textAlg: "R U' R'",
    cases: [
      { id: 'apart', alg: "U' R U R' U2 R U' R'", show: "U' · R U R' · U2 · R U' R'" },
      { id: 'wrong', alg: "U' R U' R' U R U R'", show: "U' · R U' R' · U · R U R'" },
      { id: 'up', alg: "R U2 R' U' R U R'", show: "R U2 R' · U' · R U R'" },
    ],
    mask: MASK,
  },
  {
    id: 'f2lStuck',
    stage: 'corners',
    how: 3,
    textAlg: "R U R'",
    cases: [
      { id: 'corner', alg: "R U R' U' R U R'", show: "R U R' · U' · R U R'" },
      { id: 'edge', alg: "U' R U' R' U2 R U' R'", show: "U' · R U' R' · U2 · R U' R'" },
      { id: 'flipped', alg: "U' R U R' U F' U' F", show: "U' · R U R' · U · F' U' F" },
    ],
    mask: MASK,
  },
  {
    id: 'f2lTips',
    stage: 'corners',
    how: 4,
    cases: [],
    mask: MASK,
  },
];
