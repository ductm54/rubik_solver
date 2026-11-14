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
  The scanner now defaults to a **guide frame**: line a face up roughly with a square and the
  grid snaps to it. Free-hand, the default, finds the face anywhere in the picture. Center
  stickers are read around their edge, so a brand logo in the middle does not change the colour.
- **Phase 3**: timer with WCA inspection (+2 after 15 s, DNF after 17 s), hold-and-release start,
  random-state scrambles, solve history with ao5 / ao12 / ao100, a history chart, penalties and
  notes, csTimer import / export, saved in IndexedDB
  ([demo](https://ductm54.github.io/rubik_solver/timer.html)). Plan: [Rubik Cube Scanner App — Plan](https://claude.ai/artifact/K7kwAwiXBCjcMvoC7A37Yv).

- **Phase 4**: solve helper for learning CFOP ([demo](https://ductm54.github.io/rubik_solver/learn.html)).
  Enter, scan or scramble a cube and see the solve as steps: an optimal cross, 4 F2L pairs (each
  with its case described and an algorithm built from standard triggers), then OLL and PLL with the
  case name and a recognition hint. Each step plays in the 3D viewer from the cube as it is at that
  point, with the pieces that don't matter yet greyed out. **Solver settings**, remembered in the
  browser: cross colours (tick several and the solver picks the shortest for each cube), F2L standard
  (turn the cube, one front-right case at a time) or advanced (no turns, any slot, best pair order), OLL 2-look
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
| `src/vision/grid.ts` | A 3 × 3 face placed by position, size and turn, and its two measurements: how flat each cell is, and how strong the outline around the face is |
| `src/vision/faceSearch.ts` | `findFace(frame)`: tries every position, size and turn on a shrunk frame (integral images), keeps placements with flat cells and an outline, fine-tunes the best |
| `src/vision/detect.ts` | `detectFace(frame)`: `findFace`, then 9 Lab colour readings with glare rejection (center on a ring), and a neighbour strip when one shows |
| `src/vision/follow.ts` | `FaceFollower`: follows the face from frame to frame (about 4 ms), re-searches the whole frame every third frame or when the colours change, and believes a plain white face only where a cube was just seen |
| `src/vision/color.ts` | sRGB → Lab, sticker distance, nearest-colour reading, `classifyBalanced` (centers as references, exactly 9 per colour, Hungarian assignment) |
| `src/vision/guide.ts` | Guide-frame scanning: `fitGuide(frame, square)` finds where the face really sits near the square, `readGuide` reads its 9 cells (center cell on a ring, to skip logos), `SteadyDetector` for auto-capture, `findDuplicate` to spot a face scanned twice in any rotation |
| `src/vision/tracker.ts` | Free-hand auto-capture: fires once the same nine colours have been read for 350 ms, even while the cube moves; the capture is the average over that time |
| `src/vision/synth.ts` | Synthetic camera frames: a flat face (perspective, tint, glare, noise, clutter) and a ray-cast 3D cube for tilted views with visible side strips; used only by the simulated-cube mode |
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
| `src/solve/cfop/f2lAdvanced.ts` | Advanced F2L: per-slot trigger tables for all 576 pair places, stuck pieces handled in the same search, every pair order tried |
| `src/solve/cfop/ll.ts`, `algs/` | OLL (57, or 3 + 7 for 2-look) and PLL (21, or 2 + 4); cases recognised by running each algorithm backwards, with pre / post AUF |
| `src/solve/cfop/index.ts` | CFOP: tries every allowed cross colour in all 4 holds, keeps the shortest |
| `demo/learn.*`, `demo/settings.ts` | Learn page: cube input, settings view, step list and viewer |
| `demo/timer.*`, `demo/chart.ts` | Timer page: scramble + preview, timing pad, stats, history chart, solve table |
| `demo/scan.*` | Camera page: free-hand or guide frame mode, overlay, live reading, six captured-face slots; also a simulated cube (with a logo on the white center) and photo upload |
| `demo/` | 2D net editor, Generate button, scramble text and a `cubing.js` 3D viewer; the solver runs in a Web Worker |
| `tests/` | Cube, solver and timer tests; `scan-real.test.ts` runs the scanner on the real photos in `tests/fixtures` |

## Notes

- **No OpenCV.js.** The plan named it for finding the sticker grid; the vision code here is plain
  TypeScript instead of a ~10 MB download, and it runs unchanged in Node, so it is tested there.
- **Scanner tests use real photos** (`tests/fixtures`): a hand-held stickerless cube and an
  overexposed stickered cube, cube-free views, and a phone video of the
  cube being turned by hand (three of them, in different light, replayed frame by frame the
  way the page does it). Each photo is shrunk to video sizes for
  free-hand, and re-framed the way a hand holds a cube in front of a
  phone (up to 20% too small or big, turned 10°, a quarter sticker off-center, slightly blurred)
  and the whole cube must come out right. The earlier synthetic-image tests passed while real
  cubes failed, so they are gone; the synthetic renderer only feeds the "Simulated cube" button.

- **Guide frame.** The second mode: you hold a face roughly in a square on screen. Nobody
  holds a cube exactly on a grid, so the grid is fitted to the face first: it tries sizes, turns
  and offsets near the square and keeps the one where all 9 cells are flat colours (a cell that
  straddles two stickers is not flat). This needs no gaps between stickers, so it works on
  stickerless cubes, in about 10 ms per reading. A face is captured after it holds still for
  0.45 s, or on a tap. Faces can be shown in any order and rotation; rotations come from the search
  below (one answer for about 99% of random cubes, otherwise "Next possibility").
- **Free-hand detection without gaps.** The first detector looked for sticker-sized square regions
  between edges. On a stickerless cube same-coloured neighbours merge into one region and border
  stickers merge with a similar background; on the real photos it found about half the faces at
  video size. The detector now looks for what a face is rather than for its gaps: a 3 × 3 placement
  whose cells are each one flat colour, with something else just outside all four sides. On the
  real photos it finds all 84 views (both cubes, face 40 to 200 px wide) in the right place, and
  nothing in 30 cube-free views, at about 25 ms per frame (4 ms while following a face).
- **Capture follows a moving cube.** The first capture rule wanted the cube's corners to stay within
  6% of where they were for 300 ms. A hand does not hold a cube that still: on a real phone video
  the detector read every face steadily for 1.3 to 2.2 s, yet only 2 of 6 were captured. Now the
  reading has to hold still, not the cube, and all six are captured within a second of coming
  into view, down to 5 frames per second.
- **A side that is all one colour** (a solved side) has nothing inside it to go by, so it is found by
  its outline alone: a clear step on at least 11 of its 12 outer cell edges. A sheet of paper or
  a floor tile has that too, so a vivid one is accepted as it is, and a white one only where a
  cube was seen in the last 4 seconds. Show another face first if the white side is solved.
- **Repeats.** The light on a turning cube changes, so the same face read twice is not the same
  numbers (on real video: up to 35 apart on one sticker, 24 on average). Two different faces
  always have a sticker 90 or more apart. A repeat is a face with no sticker far off.
- **Preview colours.** Before the whole cube is known, stickers are named by hue. This cube's red
  sits at hue -7 to 17 and its orange at 23 to 45 depending on the light, so the boundary between
  them is set by the gap between the reddish stickers in view (within a face, and across the
  faces captured so far) when there are two groups. In low light a red goes pale; with an orange
  in view to compare against it is still named red.
- **Free-hand limits.** White stickers against a white background weaken the outline. The fit is a
  square, so a face tilted far away from the camera is read less reliably. A view held between
  two faces can be captured as a face; the cube then does not validate.
- **Logos and colour reading.** Each cell's colour is its largest group of similar pixels, never a
  blend, so a logo, glare or a sticker gap is ignored unless it covers most of the cell. The center
  cell is also sampled on a ring that skips its middle. Faces are named at the end by matching the 6
  centers one-to-one to the 6 colours, and each colour's reference is then refined from all 9 of its
  stickers. The live preview of a single face goes by hue and saturation, so an overexposed sticker
  is not shown as white.
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
  full; about 48 with all 6 cross colours allowed. Advanced F2L takes about 22 moves instead of 26
  (about 50 in total with full OLL / PLL, 43 with all colours). Each solve takes 2-10 ms in the worker.
- **F2L algorithms** come from a shortest-path search over the 150 places a pair can be, using only
  triggers that leave the cross and other slots alone (R U R', F' U F, R' F R F', ...), so every case is
  covered and each algorithm is checked, at the cost of some differing from the usual published ones.
- **Deploys:** `.github/workflows/deploy.yml` runs tests and builds on every push and pull
  request, and publishes `dist/` to GitHub Pages on pushes to the default branch. In the repo's **Settings → Pages**, set
  **Source** to **GitHub Actions** once.
