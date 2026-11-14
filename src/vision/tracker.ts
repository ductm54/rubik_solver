/**
 * Auto-capture for free-hand scanning: a detected face is captured once it has been seen steady
 * (same colours, corners barely moving, sharp enough) for `steadyMs`. It fires once per hold;
 * whether that face was already scanned is for the caller to decide.
 */
import type { FaceReading, StripReading } from './detect';
import type { Point } from './homography';

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
  /** Max corner movement during the steady window, as a fraction of the face size. */
  maxDrift?: number;
  minSharpness?: number;
}

export class CaptureTracker {
  private start: { t: number; corners: Point[]; colors: string; strip?: StripReading } | null = null;
  private lastCaptureKey = '';
  private opts: Required<TrackerOptions>;

  constructor(opts: TrackerOptions = {}) {
    this.opts = { steadyMs: 300, maxDrift: 0.06, minSharpness: 0, ...opts };
  }

  reset(): void {
    this.start = null;
    this.lastCaptureKey = '';
  }

  update(face: FaceReading | null, t: number): TrackUpdate {
    if (!face || face.sharpness < this.opts.minSharpness) {
      this.start = null;
      if (!face) this.lastCaptureKey = '';
      return { status: 'searching', progress: 0 };
    }
    const key = face.colors.join('');
    // Still looking at the face we just captured.
    if (key === this.lastCaptureKey) return { status: 'captured', progress: 1 };
    const size = Math.hypot(face.corners[0][0] - face.corners[2][0], face.corners[0][1] - face.corners[2][1]);
    const drift = this.start
      ? Math.max(...face.corners.map((c, i) => Math.hypot(c[0] - this.start!.corners[i][0], c[1] - this.start!.corners[i][1])))
      : 0;
    if (!this.start || this.start.colors !== key || drift > this.opts.maxDrift * size) {
      this.start = { t, corners: face.corners.map((c) => [...c] as Point), colors: key, strip: face.strip };
      return { status: 'steadying', progress: 0 };
    }
    // Remember a neighbour strip seen at any point while the face was held steady.
    if (face.strip) this.start.strip = face.strip;
    const progress = Math.min(1, (t - this.start.t) / this.opts.steadyMs);
    if (progress < 1) return { status: 'steadying', progress };

    const strip = face.strip ?? this.start.strip;
    this.start = null;
    this.lastCaptureKey = key;
    return { status: 'captured', progress: 1, capture: strip ? { ...face, strip } : face };
  }
}
