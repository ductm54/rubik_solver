import { FaceFollower } from '../src/vision/follow';

const follower = new FaceFollower();

onmessage = (e: MessageEvent<{ id: number; width: number; height: number; buffer: ArrayBuffer } | { reset: true }>) => {
  // A new picture (the next photo, or a video) shows a different cube position: forget the old one.
  if ('reset' in e.data) return follower.reset();
  const { id, width, height, buffer } = e.data;
  const t = performance.now();
  const face = follower.detect({ width, height, data: new Uint8ClampedArray(buffer) });
  postMessage({ id, face, ms: performance.now() - t });
};
