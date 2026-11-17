import { describe, expect, it } from 'vitest';
import type { Color } from '../src/core/cube';
import { type Turn, TurnGuide } from '../src/scan/turnHint';

// White up, green in front: [front, up] after each whole-cube turn.
type Pose = [Color, Color];
const OPP: Record<Color, Color> = { W: 'Y', Y: 'W', G: 'B', B: 'G', R: 'O', O: 'R' };
const RIGHT: Record<string, Color> = {};
for (const [f, u, r] of ['GWR', 'RWB', 'BWO', 'OWG', 'GYO', 'OYB', 'BYR', 'RYG', 'WBR', 'RBY', 'YBO', 'OBW', 'WGO', 'OGY', 'YGR', 'RGW',
  'WRG', 'GRY', 'YRB', 'BRW', 'WOB', 'BOY', 'YOG', 'GOW'].map((s) => [...s] as Color[])) RIGHT[f + u] = r;
function turn([f, u]: Pose, t: Turn): Pose {
  const r = RIGHT[f + u];
  if (t === 'x') return [OPP[u], f];
  if (t === "x'") return [u, OPP[f]];
  if (t === 'y') return [r, u];
  if (t === "y'") return [OPP[r], u];
  return [OPP[f], u];
}

describe('turn hints while scanning', () => {
  it('following the hints reaches all six faces in five turns, from any start', () => {
    for (const start of Object.keys(RIGHT)) {
      let pose = [...start] as Pose;
      const guide = new TurnGuide();
      const scanned = new Set<Color>();
      for (let n = 0; n < 6; n++) {
        expect(scanned.has(pose[0])).toBe(false);
        scanned.add(pose[0]);
        guide.see(pose[0]);
        const hint = guide.next(scanned);
        if (n === 5) expect(hint).toBeNull();
        else {
          pose = turn(pose, hint!.turn);
          if (hint!.color) expect(hint!.color).toBe(pose[0]);
        }
      }
    }
  });

  it('recovers after the user turns another way', () => {
    const guide = new TurnGuide();
    let pose: Pose = ['G', 'W'];
    const scanned = new Set<Color>(['G']);
    guide.see('G');
    expect(guide.next(scanned)!.turn).toBe('x');
    pose = turn(pose, 'y'); // ignored the hint
    scanned.add(pose[0]);
    guide.see(pose[0]);
    // One followed hint later, the predicted color is right again.
    pose = turn(pose, guide.next(scanned)!.turn);
    scanned.add(pose[0]);
    guide.see(pose[0]);
    const hint = guide.next(scanned)!;
    pose = turn(pose, hint.turn);
    expect(hint.color).toBe(pose[0]);
    expect(scanned.has(pose[0])).toBe(false);
  });

  it('points away from a face that is scanned already', () => {
    const guide = new TurnGuide();
    guide.see('G');
    guide.next(['G']);
    guide.see('Y'); // x: yellow in front, green on top, blue below
    expect(guide.next(['G', 'Y', 'B'])).toEqual({ turn: 'y', color: 'R' });
    expect(guide.next(['G', 'Y', 'B', 'R', 'O'])).toEqual({ turn: 'y2', color: 'W' });
  });
});
