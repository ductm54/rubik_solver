import { FaceFollower, type Known } from '../src/vision/follow';

const follower = new FaceFollower();

onmessage = (e: MessageEvent<{ id: number; width: number; height: number; buffer: ArrayBuffer } | { reset: true } | { known: Known }>) => {
  // A new picture (the next photo, or a video) shows a different cube position: forget the old one.
  if ('reset' in e.data) return follower.reset();
  // The faces scanned so far: they narrow down what the next one can be.
  if ('known' in e.data) return follower.setKnown(e.data.known);
  const { id, width, height, buffer } = e.data;
  const t = performance.now();
  // Always answer: the page sends the next frame only after it hears back about this one.
  let face: ReturnType<FaceFollower['detect']> | null = null;
  try {
    face = follower.detect({ width, height, data: new Uint8ClampedArray(buffer) });
  } catch {
    follower.reset();
  }
  postMessage({ id, face, ms: performance.now() - t });
};
