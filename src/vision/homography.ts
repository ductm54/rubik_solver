/** Planar homographies: least-squares fit (DLT with h33 = 1) and point mapping. */

export type Point = [number, number];
/** Row-major 3 × 3 matrix. */
export type Homography = number[];

/** Solve A x = b (n × n) by Gaussian elimination with partial pivoting; null if singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let k2 = c; k2 <= n; k2++) M[r][k2] -= k * M[c][k2];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Fit H mapping src → dst from ≥ 4 correspondences (least squares when more).
 * Points are normalised internally for numerical stability.
 */
export function fitHomography(src: Point[], dst: Point[]): Homography | null {
  if (src.length < 4 || src.length !== dst.length) return null;
  const norm = (pts: Point[]) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const d = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length || 1;
    const k = Math.SQRT2 / d;
    return { T: [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1], inv: [1 / k, 0, cx, 0, 1 / k, cy, 0, 0, 1] };
  };
  const ns = norm(src);
  const nd = norm(dst);
  const s = src.map((p) => applyH(ns.T, p));
  const d = dst.map((p) => applyH(nd.T, p));

  // Normal equations AᵀA h = Aᵀb for the 8 unknowns.
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  const addRow = (row: number[], rhs: number) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j];
    }
  };
  for (let i = 0; i < s.length; i++) {
    const [x, y] = s[i];
    const [u, v] = d[i];
    addRow([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    addRow([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = solveLinear(AtA, Atb);
  if (!h) return null;
  const Hn = [...h, 1];
  return mul(mul(nd.inv, Hn), ns.T);
}

export function mul(A: number[], B: number[]): number[] {
  const C = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) C[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c];
  return C;
}

export function applyH(H: Homography, [x, y]: Point): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function invertH(H: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}
