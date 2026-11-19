/**
 * Levels 6 to 9 of the Learn tab: the last layer of CFOP. 2-look OLL (yellow cross, then the
 * corners, and how to do any corner case with Sunes alone) and 2-look PLL (corners, then edges),
 * with a demo for every case, then full PLL and full OLL: how to go from 2-look to one look, with
 * every case on the Algorithms tab.
 *
 * The algorithms are the solver's own (solve/cfop/algs), so the course, the Solve tab and the
 * Algorithms tab agree. A demo starts from its algorithm undone on a solved cube, held the CFOP
 * way: white on the bottom, yellow on top. tests/learn.test.ts checks every start is what its
 * text says.
 */
import { STANDARD_SCHEME, formatAlg, invertAlg, parseAlg } from '../core/cube';
import { EO, OCLL } from '../solve/cfop/algs/oll';
import { CPLL, EPLL } from '../solve/cfop/algs/pll';
import { stickeringMask } from '../solve/mask';
import { FULL_MASK, type Lesson } from './beginner';

const mask = (kind: 'eo' | 'oll') => stickeringMask(STANDARD_SCHEME, { kind, cross: 'W' });
const byId = (list: { id: string; alg: string }[], id: string) => list.find((a) => a.id === id)!.alg;

export const OLL_LINE = byId(EO, 'line');
export const OLL_L = byId(EO, 'L');
export const OLL_DOT = byId(EO, 'dot');
const OCLL_IDS = ['sune', 'antisune', 'H', 'pi', 'headlights', 'T', 'bowtie'];
const ocll = Object.fromEntries(OCLL_IDS.map((id) => [id, byId(OCLL, id)]));
const invert = (alg: string) => formatAlg(invertAlg(parseAlg(alg)));

/**
 * Sunes only: a corner case solved with one Sune after another, each after a U turn that puts the
 * front-left corner where the rule says (see `learn.oll2Sunes`). The demo starts from the case
 * itself (its algorithm undone), so `end` is where the Sunes leave it: top yellow, maybe not solved.
 */
const sunes = (id: string, aufs: string[]) => {
  const alg = aufs.map((u) => `${u} ${ocll.sune}`.trim()).join(' ');
  return { id, alg, show: aufs.flatMap((u) => (u ? [u, 'Sune'] : ['Sune'])).join(' · '), end: `${invert(ocll[id])} ${alg}` };
};

export const T_PERM = byId(CPLL, 'adjacent');
export const Y_PERM = byId(CPLL, 'diagonal');
const epll = Object.fromEntries(['Ua', 'Ub', 'H', 'Z'].map((id) => [id, byId(EPLL, id)]));

export const OLL2_LESSONS: Lesson[] = [
  {
    id: 'oll2Edges',
    stage: 'top',
    how: 3,
    algs: { line: OLL_LINE, l: OLL_L },
    cases: [
      { id: 'line', alg: OLL_LINE },
      { id: 'l', alg: OLL_L },
      { id: 'dot', alg: OLL_DOT, show: `${OLL_LINE} · ${OLL_L}` },
    ],
    mask: mask('eo'),
  },
  {
    id: 'oll2Sune',
    stage: 'top',
    how: 3,
    algs: { sune: ocll.sune, antisune: ocll.antisune },
    cases: [
      { id: 'sune', alg: ocll.sune },
      { id: 'antisune', alg: ocll.antisune },
    ],
    mask: mask('oll'),
  },
  {
    id: 'oll2Sunes',
    stage: 'top',
    how: 3,
    textAlg: ocll.sune,
    cases: [sunes('pi', ['', "U'"]), sunes('T', ['', 'U', 'U2'])],
    mask: mask('oll'),
  },
  {
    id: 'oll2Corners',
    stage: 'top',
    how: 3,
    algs: { H: ocll.H, pi: ocll.pi, headlights: ocll.headlights, T: ocll.T, bowtie: ocll.bowtie },
    cases: ['H', 'pi', 'headlights', 'T', 'bowtie'].map((id) => ({ id, alg: ocll[id] })),
    mask: mask('oll'),
    ref: { set: 'oll', twoLook: true },
  },
];

export const PLL2_LESSONS: Lesson[] = [
  {
    id: 'pll2Corners',
    stage: 'top',
    how: 3,
    algs: { T: T_PERM, Y: Y_PERM },
    cases: [
      { id: 'adjacent', alg: T_PERM },
      { id: 'diagonal', alg: Y_PERM },
    ],
    mask: FULL_MASK,
  },
  {
    id: 'pll2Edges',
    stage: 'top',
    how: 4,
    algs: epll,
    cases: [
      { id: 'Ua', alg: epll.Ua },
      { id: 'Ub', alg: epll.Ub },
      { id: 'H', alg: epll.H },
      // This Z-perm ends with the top a quarter turn off: U' lines it up.
      { id: 'Z', alg: `${epll.Z} U'`, show: `${epll.Z} · U'` },
    ],
    mask: FULL_MASK,
    ref: { set: 'pll', twoLook: true },
  },
];

export const PLL_LESSONS: Lesson[] = [{ id: 'pllFull', stage: 'top', how: 4, cases: [], mask: FULL_MASK, ref: { set: 'pll' } }];

export const OLL_LESSONS: Lesson[] = [{ id: 'ollFull', stage: 'top', how: 4, cases: [], mask: mask('oll'), ref: { set: 'oll' } }];
