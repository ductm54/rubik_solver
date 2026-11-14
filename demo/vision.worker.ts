import { FaceFollower } from '../src/vision/follow';

const follower = new FaceFollower();

onmessage = (e: MessageEvent<{ id: number; width: number; height: number; buffer: ArrayBuffer }>) => {
  const { id, width, height, buffer } = e.data;
  const t = performance.now();
  const face = follower.detect({ width, height, data: new Uint8ClampedArray(buffer) });
  postMessage({ id, face, ms: performance.now() - t });
};
