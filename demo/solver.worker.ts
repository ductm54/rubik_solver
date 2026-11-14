import type { CubeState } from '../src/core/cube';
import { generateScramble, initSolver } from '../src/core/scramble';

initSolver();
postMessage({ type: 'ready' });

onmessage = (e: MessageEvent<{ id: number; state: CubeState }>) => {
  const { id, state } = e.data;
  try {
    const t = performance.now();
    const result = generateScramble(state);
    postMessage({ type: 'result', id, ...result, ms: performance.now() - t });
  } catch (err) {
    postMessage({ type: 'error', id, message: (err as Error).message });
  }
};
