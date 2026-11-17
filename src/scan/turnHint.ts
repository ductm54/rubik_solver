/**
 * Which way to turn the cube to bring a face that is not scanned yet in front of the camera.
 *
 * The centers of a cube sit in a fixed arrangement, so knowing the color facing the camera and
 * the color on top tells where the other four are. The scanner only ever sees the front center.
 * The top is worked out from the turns: after each newly read face, the cube is taken to have
 * turned the way the last hint said (an `x` when there was none). For a quarter turn that fixes
 * the top color whatever was believed before, so a wrong belief (the user turned another way, or
 * twisted the cube in the hand) is put right by the next hint that is followed.
 *
 * Turns are whole-cube rotations as the camera sees the cube:
 *   x  roll the front face up (the bottom face comes to the front)     x'  the reverse
 *   y  turn the front face to the left (the right face comes in front)  y'  the reverse
 *   y2 turn the cube around to its back
 */
import type { Color } from '../core/cube';

export type Turn = 'x' | "x'" | 'y' | "y'" | 'y2';

type Vec = readonly [number, number, number];
// Standard scheme, white up and green in front: x to the right, y up, z toward the viewer.
const AXIS: Record<Color, Vec> = { R: [1, 0, 0], O: [-1, 0, 0], W: [0, 1, 0], Y: [0, -1, 0], G: [0, 0, 1], B: [0, 0, -1] };
const COLORS = Object.keys(AXIS) as Color[];

export const opposite = (c: Color): Color => COLORS.find((o) => AXIS[o].every((v, i) => v === -AXIS[c][i]))!;

function cross(a: Color, b: Color): Color {
  const [ax, ay, az] = AXIS[a];
  const [bx, by, bz] = AXIS[b];
  const v = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  return COLORS.find((o) => AXIS[o].every((x, i) => x === v[i]))!;
}

export interface Hint {
  turn: Turn;
  /** Center color of the face the turn brings to the front, when it is known. */
  color?: Color;
}

export class TurnGuide {
  private front: Color | null = null;
  private up: Color | null = null;
  private hinted: Turn | null = null;

  /** The cube may have been picked up anew: nothing is known about how it is held. */
  reset(): void {
    this.front = this.up = this.hinted = null;
  }

  /** A face with this center color was read steadily: it is in front of the camera now. */
  see(center: Color): void {
    const old = this.front;
    this.front = center;
    if (!old || old === center) return;
    if (center === opposite(old)) return; // turned around; taken as y2, which keeps the top
    switch (this.hinted) {
      case "x'":
        this.up = opposite(old);
        break;
      case 'y':
      case 'y2':
        this.up = cross(old, center); // the old front went to the left
        break;
      case "y'":
        this.up = cross(center, old);
        break;
      default:
        this.up = old;
    }
  }

  /** The turn toward a face whose center is not among `scanned`; null when there is none. */
  next(scanned: Iterable<Color>): Hint | null {
    const done = new Set(scanned);
    const f = this.front;
    this.hinted = null;
    if (!f || done.size >= 6) return null;
    let hint: Hint | null = null;
    if (this.up) {
      const u = this.up;
      const sides: [Turn, Color][] = [
        ['x', opposite(u)],
        ['y', cross(u, f)],
        ["x'", u],
        ["y'", cross(f, u)],
      ];
      const side = sides.find(([, c]) => !done.has(c));
      if (side) hint = { turn: side[0], color: side[1] };
    } else if (COLORS.some((c) => c !== f && c !== opposite(f) && !done.has(c))) hint = { turn: 'x' };
    if (!hint && !done.has(opposite(f))) hint = { turn: 'y2', color: opposite(f) };
    this.hinted = hint?.turn ?? null;
    return hint;
  }
}
