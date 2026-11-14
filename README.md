# Rubik Solver

A cube scanner + timer app: turn the cube freely in front of the camera, the app reads all 6
faces, works out a scramble that reproduces that exact state, and times your solve.

Done so far:
- **Phase 0**: core cube logic. Type in 54 colours, get a valid scramble ([demo](https://ductm54.github.io/rubik_solver/)).
- **Phase 1**: live face detection in the camera and colour reading of one face, with
  auto-capture ([demo](https://ductm54.github.io/rubik_solver/scan.html)).
- **Phase 2**: free-hand 6-face scan: faces in any order and rotation, neighbour-strip
  orientation, whole-cube colour reading, a review / manual fix screen, and hand-off to the
  scramble page.
- **Phase 3**: timer with WCA inspection (+2 after 15 s, DNF after 17 s), hold-and-release start,
  random-state scrambles, solve history with ao5 / ao12 / ao100, a history chart, penalties and
  notes, csTimer import / export, saved in IndexedDB
  ([demo](https://ductm54.github.io/rubik_solver/timer.html)). Plan: [Rubik Cube Scanner App — Plan](https://claude.ai/artifact/K7kwAwiXBCjcMvoC7A37Yv).

- **Phase 4**: solve helper for learning CFOP ([demo](https://ductm54.github.io/rubik_solver/learn.html)).
  Enter, scan or scramble a cube and see the solve as steps: an optimal cross, 4 F2L pairs (each
  with its case described and an algorithm built from standard triggers), then OLL and PLL with the
  case name and a recognition hint. Each step plays in the 3D viewer from the cube as it is at that
  point, with the pieces that don't matter yet greyed out. **Solver settings**, remembered in the
  browser: cross colours (tick several and the solver picks the shortest for each cube), OLL 2-look
  or full 57, PLL 2-look or full 21. The settings view is built from each method's own setting list,
  ready for more methods.

**Live demo:** https://ductm54.github.io/rubik_solver/ · scanner: https://ductm54.github.io/rubik_solver/scan.html · timer: https://ductm54.github.io/rubik_solver/timer.html · learn: https://ductm54.github.io/rubik_solver/learn.html

## Develop

```bash
npm install
npm run dev      # demo at http://localhost:5173
npm test         # Vitest
npm run build    # static site in dist/
```

## Layout

| Path | What |
| --- | --- |
| `src/core/cube.ts` | Colours, faces, `CubeState`, `rotateFace90`, facelet strings (URFDLB), sticker-level move engine |
| `src/core/validate.ts` | Colour counts, real pieces, each piece once, twist / flip / parity checks with readable errors |
| `src/core/orient.ts` | `assemble(scans)`: faces in any order and rotation (+ optional neighbour strip) → every valid cube state |
| `src/core/scramble.ts` | Kociemba two-phase solve (`cubejs`), invert, self-check that the scramble rebuilds the input |
| `src/vision/detect.ts` | `detectFace(frame)`: edge map → square sticker regions → 3 × 3 grid fit (homography) → 9 Lab colour readings with glare rejection |
| `src/vision/color.ts` | sRGB → Lab, sticker distance, nearest-colour reading, `classifyBalanced` (centers as references, exactly 9 per colour, Hungarian assignment) |
| `src/vision/tracker.ts` | Auto-capture once a face is steady for 300 ms; duplicate-center detection |
| `src/vision/synth.ts` | Synthetic camera frames: a flat face (perspective, tint, glare, noise, clutter) and a ray-cast 3D cube for tilted views with visible side strips; used by tests and the simulated-cube mode |
| `src/scan/readCube.ts` | 6 captures → cube: centers name the faces, exactly 9 per colour, strips matched by colour proportions, `assemble()`, best guess for manual fixing |
| `src/timer/machine.ts` | Timer state machine: inspection, hold-to-ready, false starts, +2 / DNF from inspection |
| `src/timer/stats.ts` | Solve records, time formatting, WCA averages (5% trimmed, DNF rules), rolling and best aoN |
| `src/timer/cstimer.ts` | csTimer export / import (all sessions) |
| `src/timer/store.ts` | Solve storage: IndexedDB, in-memory fallback; one interface for SQLite later |
| `src/solve/types.ts`, `methods.ts` | Method interface (settings definitions + `solve`) and the method registry |
| `src/solve/pieces.ts` | Piece lookup on a 54-sticker array, relative to the current centers |
| `src/solve/mask.ts` | cubing.js stickering masks per step (any cross colour) |
| `src/solve/cfop/cross.ts` | Optimal cross: 24⁴ distance table by BFS |
| `src/solve/cfop/f2l.ts` | F2L pairs: y-turn to front-right, take stuck pieces out, then the shortest trigger sequence for the case (all 150 pair placements, ≤ 11 moves) |
| `src/solve/cfop/ll.ts`, `algs/` | OLL (57, or 3 + 7 for 2-look) and PLL (21, or 2 + 4); cases recognised by running each algorithm backwards, with pre / post AUF |
| `src/solve/cfop/index.ts` | CFOP: tries every allowed cross colour in all 4 holds, keeps the shortest |
| `demo/learn.*`, `demo/settings.ts` | Learn page: cube input, settings view, step list and viewer |
| `demo/timer.*`, `demo/chart.ts` | Timer page: scramble + preview, timing pad, stats, history chart, solve table |
| `demo/scan.*` | Camera page: overlay, live reading, six captured-face slots; also a simulated cube and photo upload |
| `demo/` | 2D net editor, Generate button, scramble text and a `cubing.js` 3D viewer; the solver runs in a Web Worker |
| `tests/` | Move-engine checks and the five Phase 0 acceptance tests |

## Notes

- **No OpenCV.js.** The plan named it for finding the sticker grid; the detector here is ~10 KB of
  plain TypeScript instead of a ~10 MB download, and it runs unchanged in Node, so it is unit-tested
  against synthetic frames (≥ 97% detection of fully visible faces over random poses, lighting and
  clutter, with no wrong reads), at about 7 ms per 360 px frame.

- **Orientation search** tries all 4⁶ = 4,096 face rotations, not 4⁵: rotating one face's
  stickers changes the cube, so the first face can't be fixed for free. It's still ~10 ms.
- **Neighbour strips** are found by marching outward from each face edge: a short run of
  sticker colour between dark cube-body pixels. On rendered tilted views (15–30°) they are found
  in 99% of frames with correct colours, and never on straight-on views. A strip that disagrees
  with the other faces is dropped and the rotation search takes over.
- **Strip pinning** in `assemble()` pins the rotation with no search for ~98% of cubes; when a strip matches a
  wrong row by coincidence, a handful (≤ 4) of candidates are checked. The answer was unique in
  every test run.
- **CFOP move counts** (random cubes, white cross): about 65 moves with 2-look OLL / PLL, 55 with
  full; about 48 with all 6 cross colours allowed. Each solve takes 2-10 ms in the worker.
- **F2L algorithms** come from a shortest-path search over the 150 places a pair can be, using only
  triggers that leave the cross and other slots alone (R U R', F' U F, R' F R F', ...), so every case is
  covered and each algorithm is checked, at the cost of some differing from the usual published ones.
- **Deploys:** `.github/workflows/deploy.yml` runs tests, builds and publishes `dist/` to GitHub
  Pages on every push to `main` or `claude/**`. In the repo's **Settings → Pages**, set
  **Source** to **GitHub Actions** once.
