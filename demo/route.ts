/** Which view a URL hash opens. */
export type Route = 'cube' | 'solve' | 'learn' | 'timer';

/**
 * `#solve…`, `#learn…`, `#timer…`, else the Cube view. The solve helper used to live at `#learn`,
 * so a `#learn` link that carries a cube (`&scramble=` or `&cube=`) still opens Solve.
 */
export function routeOf(hash: string): Route {
  const h = hash.slice(1);
  const head = h.split(/[&=?]/)[0];
  if (head === 'learn' && /[&?](scramble|cube)=/.test(h)) return 'solve';
  return head === 'timer' || head === 'solve' || head === 'learn' ? head : 'cube';
}
