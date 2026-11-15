/**
 * Face detection across video frames. Searching the whole frame costs about 25 ms; fine-tuning
 * the placement found in the previous frame costs about 4. But fine-tuning only looks nearby, so
 * after the cube moved or turned it can settle on a neighbouring spot that merely looks like a
 * face. So: follow the previous placement, and search the whole frame again whenever the colours
 * read differ from the last frame, and on every third frame regardless.
 *
 * It also decides when to believe a face that is all one colour. Such a face is found by its
 * outline and the seams between its pieces, and a floor tile or a window can have those too. A
 * vivid one (red, orange, yellow, green, blue) is taken as it is, because vivid squares with
 * lines across them are rare. A white one is only taken where a cube was seen moments before:
 * the user turned the cube and its white side came up.
 */
import { type FaceReading, type RGBAImage, detectFace } from './detect';

const VERIFY_EVERY = 3;
/** How long after a cube was seen a plain white face is still believed, in ms. */
const CUBE_MEMORY = 4000;

export class FaceFollower {
  private last: FaceReading | null = null;
  private sinceSearch = 0;
  /** The last face that is certainly a cube, and when it was seen. */
  private cube: { t: number; cx: number; cy: number; pitch: number } | null = null;

  reset(): void {
    this.last = null;
    this.sinceSearch = 0;
    this.cube = null;
  }

  /** @param t time of the frame in ms (any clock) */
  detect(img: RGBAImage, t: number = performance.now()): FaceReading | null {
    let face: FaceReading | null = null;
    if (this.last && ++this.sinceSearch < VERIFY_EVERY) {
      face = detectFace(img, { previous: this.last.placement, searchIfLost: false }).face;
      if (face && face.colors.join('') !== this.last.colors.join('')) face = null;
    }
    if (!face) {
      face = detectFace(img).face;
      this.sinceSearch = 0;
    }
    if (face && !this.believe(face, t)) face = null;
    if (face) this.cube = { t, cx: face.placement.cx, cy: face.placement.cy, pitch: face.placement.pitch };
    this.last = face;
    return face;
  }

  private believe(face: FaceReading, t: number): boolean {
    if (!face.plain) return true;
    const [r, g, b] = face.stickers[4].rgb;
    const max = Math.max(r, g, b);
    if (max && (max - Math.min(r, g, b)) / max >= 0.35) return true; // vivid
    const c = this.cube;
    if (!c || t - c.t > CUBE_MEMORY) return false;
    const p = face.placement;
    return Math.hypot(p.cx - c.cx, p.cy - c.cy) < 4 * c.pitch && p.pitch > c.pitch * 0.5 && p.pitch < c.pitch * 2;
  }
}
