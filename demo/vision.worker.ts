import { detectFace } from '../src/vision/detect';

onmessage = (e: MessageEvent<{ id: number; width: number; height: number; buffer: ArrayBuffer }>) => {
  const { id, width, height, buffer } = e.data;
  const t = performance.now();
  const { face, regions } = detectFace({ width, height, data: new Uint8ClampedArray(buffer) });
  postMessage({ id, face, regions, ms: performance.now() - t });
};
