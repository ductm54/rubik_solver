/** PLL algorithms. Cases are recognised from each algorithm itself. */
import type { AlgEntry } from './oll';

const P = (id: string, alg: string, hint: string): AlgEntry => ({ id, name: `${id}-perm`, alg, hint });

/** The 21 PLL cases. */
export const PLL: AlgEntry[] = [
  P('Aa', "x R' U R' D2 R U' R' D2 R2 x'", 'Only corners move: three corners cycle; one side has headlights.'),
  P('Ab', "x R2 D2 R U R' D2 R U' R x'", 'Only corners move: three corners cycle the other way; one side has headlights.'),
  P('E', "x' R U' R' D R U R' D' R U R' D R U' R' D' x", 'Only corners move: two diagonal swaps; no headlights anywhere.'),
  P('F', "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R", 'One side shows a full 3-sticker bar next to headlights on the opposite side.'),
  P('Ga', "R2 U R' U R' U' R U' R2 U' D R' U R D'", 'G-perm: one pair of headlights and a matching corner-edge block elsewhere.'),
  P('Gb', "R' U' R U D' R2 U R' U R U' R U' R2 D", 'G-perm: one pair of headlights and a matching corner-edge block elsewhere.'),
  P('Gc', "R2 U' R U' R U R' U R2 U D' R U' R' D", 'G-perm: one pair of headlights and a matching corner-edge block elsewhere.'),
  P('Gd', "R U R' U' D R2 U' R U' R' U R' U R2 D'", 'G-perm: one pair of headlights and a matching corner-edge block elsewhere.'),
  P('H', 'M2 U M2 U2 M2 U M2', 'Only edges move: opposite edges swap; headlights on all four sides.'),
  P('Ja', "x R2 F R F' R U2 r' U r U2 x'", 'Headlights on one side and a 1×3 bar on the side next to it (left).'),
  P('Jb', "R U R' F' R U R' U' R' F R2 U' R'", 'Headlights on one side and a 1×3 bar on the side next to it (right).'),
  P('Na', "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'", 'No headlights; every side shows a 2-sticker block and a lone sticker.'),
  P('Nb', "R' U R U' R' F' U' F R U R' F R' F' R U' R", 'No headlights; every side shows a 2-sticker block and a lone sticker (mirrored).'),
  P('Ra', "R U' R' U' R U R D R' U' R D' R' U2 R'", 'Headlights on one side; the opposite side has a 2-sticker block.'),
  P('Rb', "R2 F R U R U' R' F' R U2 R' U2 R", 'Headlights on one side; the opposite side has a 2-sticker block (mirrored).'),
  P('T', "R U R' U' R' F R2 U' R' U' R U R' F'", 'Headlights on two opposite sides; the other two sides each show a 2-sticker block.'),
  P('Ua', "M2 U M U2 M' U M2", 'Only edges move: three edges cycle; one side is fully solved.'),
  P('Ub', "M2 U' M U2 M' U' M2", 'Only edges move: three edges cycle the other way; one side is fully solved.'),
  P('V', "R U' R U R' D R D' R U' D R2 U R2 D' R2", 'No headlights; a corner-edge block sits diagonally from another.'),
  P('Y', "F R U' R' U' R U R' F' R U R' U' R' F R F'", 'No headlights; corners swap diagonally, two blocks next to each other.'),
  P('Z', "M' U M2 U M2 U M' U2 M2", 'Only edges move: two pairs of adjacent edges swap; headlights on all four sides.'),
];

/** 2-look PLL, step 1: put the corners in place. */
export const CPLL: AlgEntry[] = [
  { id: 'adjacent', name: 'Corner swap (adjacent)', alg: "R U R' U' R' F R2 U' R' U' R U R' F'", hint: 'Exactly one side has headlights: hold them on the left and do a T-perm.' },
  { id: 'diagonal', name: 'Corner swap (diagonal)', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'", hint: 'No headlights on any side: do a Y-perm.' },
];

/** 2-look PLL, step 2: corners are done, cycle the edges. */
export const EPLL: AlgEntry[] = [
  { id: 'Ua', name: 'Ua-perm', alg: "M2 U M U2 M' U M2", hint: 'One side solved: three edges cycle.' },
  { id: 'Ub', name: 'Ub-perm', alg: "M2 U' M U2 M' U' M2", hint: 'One side solved: three edges cycle the other way.' },
  { id: 'H', name: 'H-perm', alg: 'M2 U M2 U2 M2 U M2', hint: 'Opposite edges swap: every side shows the wrong middle sticker.' },
  { id: 'Z', name: 'Z-perm', alg: "M' U M2 U M2 U M' U2 M2", hint: 'Neighbouring edges swap in two pairs.' },
];
