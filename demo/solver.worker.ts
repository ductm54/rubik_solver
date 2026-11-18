import type { CubeState } from '../src/core/cube';
import { generateScramble, initSolver, randomStateScramble } from '../src/core/scramble';
import { setLocale } from '../src/i18n';
import { getMethod } from '../src/solve/methods';
import type { SettingValues } from '../src/solve/types';

initSolver();
postMessage({ type: 'ready' });

type Req = { lang?: string } & (
  | { id: number; state: CubeState; kind?: 'solve' }
  | { id: number; kind: 'random' }
  | { id: number; kind: 'plan'; state: CubeState; method: string; settings: SettingValues; scramble?: string }
);

// Requests are handled in order, each in its page's language (step texts and errors).
let queue = Promise.resolve();
onmessage = (e: MessageEvent<Req>) => {
  queue = queue.then(() => handle(e.data));
};

async function handle(req: Req) {
  try {
    await setLocale(req.lang ?? 'en');
    const t = performance.now();
    if (req.kind === 'plan') {
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
}
