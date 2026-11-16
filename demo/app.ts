/**
 * The app shell: Cube, Timer and Learn are views of one page, picked by the URL hash, so
 * switching between them never reloads. A view's code loads the first time it is opened.
 *
 *   #cube, #cube=<54 letters>, #scan     Cube (and its scanner)
 *   #timer, #timer&scramble=<moves>      Timer
 *   #learn, #learn&scramble=<moves>      Learn (also #learn&cube=<54 letters>)
 */
import './i18n';
import { t } from '../src/i18n';
import { initTour } from './tour';

type Route = 'cube' | 'timer' | 'learn';
/** What a view exports: `show` runs each time its tab is opened again, `hide` when it is left. */
interface View {
  show(): void;
  hide(): void;
}

const loaders: Record<Route, () => Promise<View>> = {
  cube: () => import('./main'),
  timer: () => import('./timer'),
  learn: () => import('./learn'),
};
const loaded: Partial<Record<Route, Promise<View>>> = {};
let current: Route | null = null;

function routeOf(hash: string): Route {
  const head = hash.slice(1).split(/[&=?]/)[0];
  return head === 'timer' || head === 'learn' ? head : 'cube';
}

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
