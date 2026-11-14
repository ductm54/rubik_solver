import { describe, expect, it } from 'vitest';
import {
  applyMoves,
  fromFacelets,
  invertAlg,
  parseAlg,
  formatAlg,
  rotateFace90,
  solvedState,
  statesEqual,
  toFacelets,
} from '../src/core/cube';

const solved = solvedState();

describe('move engine', () => {
  it('each face turn has order 4', () => {
    for (const m of 'U R F D L B'.split(' ')) {
      expect(statesEqual(applyMoves(solved, `${m} ${m} ${m} ${m}`), solved)).toBe(true);
      expect(statesEqual(applyMoves(solved, m), solved)).toBe(false);
    }
  });

  it("sexy move (R U R' U') has order 6", () => {
    let s = solved;
    for (let i = 0; i < 6; i++) {
      s = applyMoves(s, "R U R' U'");
      if (i < 5) expect(statesEqual(s, solved)).toBe(false);
    }
    expect(statesEqual(s, solved)).toBe(true);
  });

  it('matches known Kociemba facelet strings', () => {
    // From the cubejs reference implementation.
    expect(toFacelets(applyMoves(solved, 'R'))).toBe('UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB');
    expect(toFacelets(applyMoves(solved, 'U'))).toBe('UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB');
    expect(toFacelets(applyMoves(solved, 'F'))).toBe('UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB');
  });

  it('inverse cancels', () => {
    const alg = parseAlg("R U2 F' L D B2 x y' z2");
    expect(statesEqual(applyMoves(applyMoves(solved, alg), invertAlg(alg)), solved)).toBe(true);
    expect(formatAlg(invertAlg(parseAlg("R U2 F'")))).toBe("F U2 R'");
  });

  it('rotateFace90 rotates clockwise', () => {
    expect(rotateFace90([0, 1, 2, 3, 4, 5, 6, 7, 8])).toEqual([6, 3, 0, 7, 4, 1, 8, 5, 2]);
  });

  it('facelet round trip', () => {
    const s = applyMoves(solved, "R U F' D2");
    expect(statesEqual(fromFacelets(toFacelets(s)), s)).toBe(true);
  });
});
