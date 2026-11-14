import type { CubeState } from '../src/core/cube';
import { generateScramble, initSolver, randomStateScramble } from '../src/core/scramble';

initSolver();
postMessage({ type: 'ready' });

type Req = { id: number; state: CubeState; kind?: 'solve' } | { id: number; kind: 'random' };

onmessage = (e: MessageEvent<Req>) => {
  const req = e.data;
  try {
    const t = performance.now();
    const result = req.kind === 'random' ? randomStateScramble() : generateScramble(req.state);
    postMessage({ type: 'result', id: req.id, ...result, ms: performance.now() - t });
  } catch (err) {
    postMessage({ type: 'error', id: req.id, message: (err as Error).message });
  }
};
