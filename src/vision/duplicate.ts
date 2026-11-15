/** findDuplicate(): whether a face was already captured, in any rotation. */
import { type Lab, stickerDistance } from './color';

const ROTATIONS = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  [6, 3, 0, 7, 4, 1, 8, 5, 2],
  [8, 7, 6, 5, 4, 3, 2, 1, 0],
  [2, 5, 8, 1, 4, 7, 0, 3, 6],
];

/**
 * Index of the captured face that `labs` shows again (the same stickers in some rotation), or
 * -1. Compares raw readings, so it does not depend on naming the colours.
 *
 * The light on a turning cube changes, so the same face read at two moments is not the same
 * numbers: on real video its stickers differ by up to 35, and by 24 on average. Two different
 * faces always have some sticker that is a different colour altogether (90 or more apart). So a
 * repeat is a face where no sticker is far off and the average is close.
 */
export function findDuplicate(labs: Lab[], captured: (Lab[] | null | undefined)[]): number {
  let best = -1;
  let bestMean = 30;
  for (let i = 0; i < captured.length; i++) {
    const c = captured[i];
    if (!c) continue;
    for (const rot of ROTATIONS) {
      let sum = 0;
      let worst = 0;
      for (let j = 0; j < 9; j++) {
        const d = stickerDistance(labs[j], c[rot[j]]);
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
