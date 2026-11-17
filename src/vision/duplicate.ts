/** findDuplicate(): whether a face was already captured, in any rotation. */
import type { Color } from '../core/cube';
import { type Lab, type RGB, nameTogether, stickerDistance } from './color';

const ROTATIONS = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  [6, 3, 0, 7, 4, 1, 8, 5, 2],
  [8, 7, 6, 5, 4, 3, 2, 1, 0],
  [2, 5, 8, 1, 4, 7, 0, 3, 6],
];

/** A face reading: 9 stickers row by row, in Lab and (when known) sRGB. */
export interface Reading {
  labs: Lab[];
  rgbs?: RGB[];
}

/**
 * Index of the captured face that `face` shows again (the same stickers in some rotation), or
 * -1. Compares raw readings, so it does not depend on naming the colours.
 *
 * The light on a turning cube changes, so the same face read at two moments is not the same
 * numbers: on real video its stickers differ by up to 35, and by 24 on average. Two different
 * faces always have some sticker that is a different colour altogether (90 or more apart). So a
 * repeat is a face where no sticker is far off and the average is close.
 *
 * With one exception: red and orange are closer than that. On a nearly solved cube the red and
 * the orange side can show the same pattern, one mostly red and one mostly orange, and they pass
 * as one face. A face's center never changes, though, so two faces with different centers are two
 * faces. The centers are named together with every sticker scanned so far, which is what tells
 * red from orange (see redOrangeSplit).
 */
export function findDuplicate(face: Reading, captured: (Reading | null | undefined)[]): number {
  const centers = centerNames(face, captured);
  let best = -1;
  let bestMean = 30;
  for (let i = 0; i < captured.length; i++) {
    const c = captured[i];
    if (!c) continue;
    if (centers && centers.captured[i] !== centers.face) continue;
    for (const rot of ROTATIONS) {
      let sum = 0;
      let worst = 0;
      for (let j = 0; j < 9; j++) {
        const d = stickerDistance(face.labs[j], c.labs[rot[j]]);
        sum += d;
        if (d > worst) worst = d;
      }
      if (worst < 45 && sum / 9 < bestMean) {
        bestMean = sum / 9;
        best = i;
      }
    }
  }
  return best;
}

/** The center colour of the face and of each captured one, named together; null without sRGB. */
function centerNames(face: Reading, captured: (Reading | null | undefined)[]): { face: Color; captured: (Color | undefined)[] } | null {
  if (!face.rgbs || captured.some((c) => c && !c.rgbs)) return null;
  const names = nameTogether([...captured.flatMap((c) => c?.rgbs ?? []), ...face.rgbs]);
  let k = 0;
  const of = captured.map((c) => (c ? names[(k += 9) - 5] : undefined));
  return { face: names[k + 4], captured: of };
}
