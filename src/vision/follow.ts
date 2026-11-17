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
 *
 * The faces scanned so far say more about what can come next (see Known):
 *
 *   - a colour that already shows on another face cannot fill a whole side, so a one-colour
 *     "face" of that colour is a single sticker or something in the room
 *   - a colour that is on none of two or more scanned faces has its side solved and still to
 *     come: a one-colour face of it is expected. It is looked for with less to go on (it may lack
 *     an outline on one side, like a white side over a pale floor) and believed without the
 *     cube-seen-here test
 *   - the cube stays about as large in the picture as it was, so a face under half the size of
 *     the scanned ones is part of a face, or a reflection
 */
import { type RGB, nameTogether } from './color';
import { type FaceReading, type RGBAImage, detectFace } from './detect';

/** What the faces scanned so far tell about the ones still to come. */
export interface Known {
  /** Sticker colours of the scanned faces: 9 per face, row by row, center at index 4. */
  rgbs: RGB[];
  /**
   * Sticker size of the scanned faces in frame pixels, when they came from this same camera or
   * video (photos are each taken from a different distance).
   */
  pitch?: number;
}

/** What a set of scanned faces makes known; `pitch` only for those scanned from the current camera or video. */
export function knownFrom(faces: { rgbs?: RGB[]; pitch?: number }[]): Known {
  const sizes = faces.flatMap((f) => (f.pitch ? [f.pitch] : [])).sort((a, b) => a - b);
  return { rgbs: faces.flatMap((f) => f.rgbs ?? []), ...(sizes.length ? { pitch: sizes[sizes.length >> 1] } : {}) };
}

/** A colour on none of this many scanned faces is taken to have its side solved. */
const SOLVED_AFTER = 2;
/** A face smaller than this share of the scanned ones is not a whole face. */
const MIN_SIZE = 0.5;

const VERIFY_EVERY = 3;
/** How long after a cube was seen a plain white face is still believed, in ms. */
const CUBE_MEMORY = 4000;

export class FaceFollower {
  private last: FaceReading | null = null;
  private sinceSearch = 0;
  /** The last face that is certainly a cube, and when it was seen. */
  private cube: { t: number; cx: number; cy: number; pitch: number } | null = null;

  private known: Known | null = null;
  /** A side that is all one colour is still to come. */
  private expectPlain = false;

  /** Tell the follower which faces are scanned; they stay known across reset(). */
  setKnown(known: Known | null): void {
    this.known = known?.rgbs.length ? known : null;
    const seen = new Set(this.known ? nameTogether(this.known.rgbs) : []);
    this.expectPlain = !!this.known && this.known.rgbs.length >= SOLVED_AFTER * 9 && seen.size < 6;
  }

  reset(): void {
    this.last = null;
    this.sinceSearch = 0;
    this.cube = null;
  }

  /** @param t time of the frame in ms (any clock) */
  detect(img: RGBAImage, t: number = performance.now()): FaceReading | null {
    let face: FaceReading | null = null;
    if (this.last && ++this.sinceSearch < VERIFY_EVERY) {
      face = detectFace(img, { previous: this.last.placement, searchIfLost: false, expectPlain: this.expectPlain }).face;
      if (face && face.colors.join('') !== this.last.colors.join('')) face = null;
    }
    if (!face) {
      face = detectFace(img, { expectPlain: this.expectPlain }).face;
      this.sinceSearch = 0;
    }
    if (face && !this.believe(face, t)) face = null;
    if (face) this.cube = { t, cx: face.placement.cx, cy: face.placement.cy, pitch: face.placement.pitch };
    this.last = face;
    return face;
  }

  private believe(face: FaceReading, t: number): boolean {
    const k = this.known;
    if (k?.pitch && face.placement.pitch < MIN_SIZE * k.pitch) return false;
    if (!face.plain) return true;
    if (k) {
      // named together with the scanned stickers, which settles red against orange
      const names = nameTogether([...k.rgbs, ...face.stickers.map((s) => s.rgb)]);
      const colour = names[k.rgbs.length + 4];
      const scanned = names.slice(0, k.rgbs.length);
      // A scanned face with this center is this same side shown again; the caller sorts that out.
      if (!scanned.some((c, i) => i % 9 === 4 && c === colour)) {
        if (scanned.includes(colour)) return false;
        if (this.expectPlain) return true;
      }
    }
    const [r, g, b] = face.stickers[4].rgb;
    const max = Math.max(r, g, b);
    if (max && (max - Math.min(r, g, b)) / max >= 0.35) return true; // vivid
    const c = this.cube;
    if (!c || t - c.t > CUBE_MEMORY) return false;
    const p = face.placement;
    return Math.hypot(p.cx - c.cx, p.cy - c.cy) < 4 * c.pitch && p.pitch > c.pitch * 0.5 && p.pitch < c.pitch * 2;
  }
}
