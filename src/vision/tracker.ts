/**
 * Auto-capture for free-hand scanning. A face is captured once the detector has read the same
 * nine colours from it for `steadyMs`. The cube may move while that happens: a hand never holds
 * it still, and the detector follows it. What has to hold still is the reading, compared as raw
 * colours (a sticker on the border between red and orange must not reset the clock each time
 * its name flips).
 *
 * The captured reading is the average over the whole steady window, which is less noisy than
 * any single frame. It fires once per hold; whether that face was already scanned is for the
 * caller to decide.
 */
import { type Lab, type RGB, classifySticker, stickerDistance } from './color';
import type { FaceReading, StripReading } from './detect';

export type TrackStatus = 'searching' | 'steadying' | 'captured';

export interface TrackUpdate {
  status: TrackStatus;
  /** 0..1 while steadying. */
  progress: number;
  /** Set on the frame the face is captured. */
  capture?: FaceReading;
}

export interface TrackerOptions {
  steadyMs?: number;
  /**
   * Largest colour change of any sticker that still counts as the same reading. Lightness counts
   * half: a phone keeps adjusting its exposure.
   */
  maxChange?: number;
  /** A face with fewer clean cells than this (of 9) is not captured. */
  minFound?: number;
  minSharpness?: number;
}

interface Hold {
  t: number;
  /** The reading the hold started with; later frames are compared against it. */
  labs: Lab[];
  sumLab: number[][];
  sumRgb: number[][];
  frames: number;
  strip?: StripReading;
  fired: boolean;
}

export class CaptureTracker {
  private hold: Hold | null = null;
  private opts: Required<TrackerOptions>;

  constructor(opts: TrackerOptions = {}) {
    this.opts = { steadyMs: 350, maxChange: 12, minFound: 8, minSharpness: 0, ...opts };
  }

  reset(): void {
    this.hold = null;
  }

  update(face: FaceReading | null, t: number): TrackUpdate {
    if (!face || face.found < this.opts.minFound || face.sharpness < this.opts.minSharpness) {
      this.hold = null;
      return { status: 'searching', progress: 0 };
    }
    const labs = face.stickers.map((s) => s.lab);
    let h = this.hold;
    if (!h || labs.some((l, i) => stickerDistance(l, h!.labs[i]) > this.opts.maxChange)) {
      h = this.hold = { t, labs, sumLab: labs.map(() => [0, 0, 0]), sumRgb: labs.map(() => [0, 0, 0]), frames: 0, fired: false };
    }
    face.stickers.forEach((s, i) => {
      for (let k = 0; k < 3; k++) {
        h.sumLab[i][k] += s.lab[k];
        h.sumRgb[i][k] += s.rgb[k];
      }
    });
    h.frames++;
    // Remember a neighbour strip seen at any point during the hold.
    if (face.strip) h.strip = face.strip;
    if (h.fired) return { status: 'captured', progress: 1 };
    const progress = Math.min(1, (t - h.t) / this.opts.steadyMs);
    if (progress < 1) return { status: 'steadying', progress };

    h.fired = true;
    const stickers = face.stickers.map((s, i) => {
      const lab = h.sumLab[i].map((x) => x / h.frames) as Lab;
      const rgb = h.sumRgb[i].map((x) => Math.round(x / h.frames)) as RGB;
      const cls = classifySticker(lab, undefined, rgb);
      return { ...s, lab, rgb, color: cls.color, margin: cls.margin };
    });
    const strip = face.strip ?? h.strip;
    return { status: 'captured', progress: 1, capture: { ...face, stickers, colors: stickers.map((s) => s.color), ...(strip ? { strip } : {}) } };
  }
}
