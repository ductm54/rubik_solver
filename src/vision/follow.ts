/**
 * Face detection across video frames. Searching the whole frame costs about 25 ms; fine-tuning
 * the placement found in the previous frame costs about 4. But fine-tuning only looks nearby, so
 * after the cube moved or turned it can settle on a neighbouring spot that merely looks like a
 * face. So: follow the previous placement, and search the whole frame again whenever the colours
 * read differ from the last frame, and on every third frame regardless.
 */
import { type FaceReading, type RGBAImage, detectFace } from './detect';

const VERIFY_EVERY = 3;

export class FaceFollower {
  private last: FaceReading | null = null;
  private sinceSearch = 0;

  reset(): void {
    this.last = null;
    this.sinceSearch = 0;
  }

  detect(img: RGBAImage): FaceReading | null {
    let face: FaceReading | null = null;
    if (this.last && ++this.sinceSearch < VERIFY_EVERY) {
      face = detectFace(img, { previous: this.last.placement, searchIfLost: false }).face;
      if (face && face.colors.join('') !== this.last.colors.join('')) face = null;
    }
    if (!face) {
      face = detectFace(img).face;
      this.sinceSearch = 0;
    }
    this.last = face;
    return face;
  }
}
