/**
 * The app shell: Cube, Solve, Learn, Algorithms and Timer are views of one page, picked by the URL hash, so
 * switching between them never reloads. A view's code loads the first time it is opened.
 *
 *   #cube, #cube=<54 letters>, #scan     Cube (and its scanner)
 *   #timer, #timer&scramble=<moves>      Timer
 *   #solve, #solve&scramble=<moves>      Solve (also #solve&cube=<54 letters>; old #learn&… links too)
 *   #learn                                Learn: how to solve, method by method
 *   #algs, #algs&set=oll                  Algorithms: every F2L, OLL and PLL case
 */
import './i18n';
import { t } from '../src/i18n';
import { type Route, routeOf } from './route';
import { initTour } from './tour';

/** What a view exports: `show` runs each time its tab is opened again, `hide` when it is left. */
interface View {
  show(): void;
  hide(): void;
}

const loaders: Record<Route, () => Promise<View>> = {
  cube: () => import('./main'),
  timer: () => import('./timer'),
  solve: () => import('./solve'),
  learn: () => import('./learn'),
  algs: () => import('./algs'),
};
const loaded: Partial<Record<Route, Promise<View>>> = {};
let current: Route | null = null;

async function go() {
  const next = routeOf(location.hash);
  if (next !== current) {
    if (current) {
      document.getElementById(`page-${current}`)!.hidden = true;
      void loaded[current]?.then((v) => v.hide());
    }
    current = next;
    document.getElementById(`page-${next}`)!.hidden = false;
    for (const a of document.querySelectorAll<HTMLAnchorElement>('nav.tabs a[data-route]')) {
      if (a.dataset.route === next) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    document.title = t(`${next}.docTitle`);
    window.scrollTo(0, 0);
  }
  // The first time, the view reads the hash itself as it starts up.
  const first = !loaded[next];
  const view = await (loaded[next] ??= loaders[next]());
  if (!first && current === next) view.show();
}

window.addEventListener('hashchange', () => void go());
void go();
initTour();
