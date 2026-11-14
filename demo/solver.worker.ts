import type { CubeState } from '../src/core/cube';
import { generateScramble, initSolver, randomStateScramble } from '../src/core/scramble';
import { getMethod } from '../src/solve/methods';
import type { SettingValues } from '../src/solve/types';

initSolver();
postMessage({ type: 'ready' });

type Req =
  | { id: number; state: CubeState; kind?: 'solve' }
  | { id: number; kind: 'random' }
  | { id: number; kind: 'learn'; state: CubeState; method: string; settings: SettingValues; scramble?: string };

onmessage = (e: MessageEvent<Req>) => {
  const req = e.data;
  try {
    const t = performance.now();
    if (req.kind === 'learn') {
      const scramble = req.scramble ?? generateScramble(req.state).scramble;
      const plan = getMethod(req.method).solve(req.state, req.settings);
      postMessage({ type: 'plan', id: req.id, scramble, plan, ms: performance.now() - t });
      return;
    }
    const result = req.kind === 'random' ? randomStateScramble() : generateScramble(req.state);
    postMessage({ type: 'result', id: req.id, ...result, ms: performance.now() - t });
  } catch (err) {
    postMessage({ type: 'error', id: req.id, message: (err as Error).message });
  }
};
