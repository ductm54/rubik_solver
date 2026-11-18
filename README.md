# Rubik Solver

A cube scanner + timer app: turn the cube freely in front of the camera, the app reads all 6
faces, works out a scramble that reproduces that exact state, and times your solve.

Done so far:
- **Phase 0**: core cube logic. Type in 54 colours, get a valid scramble ([demo](https://solve-rubik.pages.dev/)).
- **Phase 1**: live face detection in the camera and colour reading of one face, with
  auto-capture ([demo](https://solve-rubik.pages.dev/#scan)).
- **Phase 2**: free-hand 6-face scan: faces in any order and rotation, neighbour-strip
  orientation, whole-cube colour reading, a review / manual fix screen, and hand-off to the
  scramble page.
  The scanner finds the face anywhere in the picture. Center
  stickers are read around their edge, so a brand logo in the middle does not change the colour.
- **Phase 3**: timer with WCA inspection (+2 after 15 s, DNF after 17 s), hold-and-release start,
  random-state scrambles, solve history with ao5 / ao12 / ao100, a history chart, penalties and
  notes, csTimer import / export, saved in IndexedDB
  ([demo](https://solve-rubik.pages.dev/#timer)). Plan: [Rubik Cube Scanner App — Plan](https://claude.ai/artifact/K7kwAwiXBCjcMvoC7A37Yv).

- **Phase 4**: solve helper for learning CFOP ([demo](https://solve-rubik.pages.dev/#learn)).
  Enter, scan or scramble a cube and see the solve as steps: an optimal cross, 4 F2L pairs (each
  with its case described, its SpeedCubeDB case number and the most-voted algorithm for it), then OLL and PLL with the
  case name and a recognition hint. Each step plays in the 3D viewer from the cube as it is at that
  point, with the pieces that don't matter yet greyed out. **Solver settings**, remembered in the
  browser: cross colours (tick several and the solver picks the best for each cube), cross standard or advanced
  (XCross: the cross and at least one F2L pair together when that takes under 11 moves), F2L standard
  (turn the cube, one case at a time at the front-right or front-left, with the usual algorithms) or advanced (no turns, no B moves, any slot, best pair order, pseudo-slotting when it is shorter), OLL 2-look
  or full 57, PLL 2-look or full 21. The settings view is built from each method's own setting list,
  ready for more methods. **Step 0** says how to hold the cube during inspection: which colour on
  the bottom and which in front, chosen so the solve is short and the cross (or XCross) is easy to
  execute: few or no regrips and B turns. It also says which grip to start with, and the cross
  step says where each regrip is.
- **Beginner method** (layer by layer), picked in the Learn page's method list, with the cross colour
  as its setting: the cross one edge at a time (its slot turned to the front, no B turns), first-layer corners (corner above its slot, repeat
  R U R' U'), middle edges (right / left algorithm), yellow cross (F R U R' U' F': dot → L → line),
  yellow edges (R U R' U R U2 R' U), corners in place (U R U' L' U R' U' L) and corner twists
  (R' D' R D at the front-right). Each step says which case it is and how many repeats it takes.
- **Languages**: English, Español, Français, Deutsch, Português, Русский, 中文（简体）, 日本語 and
  Tiếng Việt, picked from the nav (or `?lang=fr`), remembered in the browser, and matched to the browser's
  language on a first visit. Everything is translated: pages, scanner messages, cube errors, timer, and
  the solver's step titles, case names and hints.

**Live demo:** https://solve-rubik.pages.dev/ · timer: https://solve-rubik.pages.dev/#timer · learn: https://solve-rubik.pages.dev/#learn

## Develop

```bash
npm install
npm run dev      # demo at http://localhost:5173
npm test         # Vitest, without the scanner tests (under a minute)
npm run test:scan  # scanner tests on the real photos and videos (a few minutes)
npm run test:all   # both
npm run build    # static site in dist/
```

CI runs `npm test` and the build on every push (`.github/workflows/test.yml`). The scanner tests
run in their own workflow (`.github/workflows/scanner.yml`), only when a push or pull request
touches what they cover: `src/vision`, `src/scan`, the cube model they use, their fixtures and
helpers, or the dependencies. They get 45 minutes there, and up to 10 per video. To run them on
any branch, use "Run workflow" on the Scanner workflow in the Actions tab.

## Layout

| Path | What |
| --- | --- |
| `src/core/cube.ts` | Colours, faces, `CubeState`, `rotateFace90`, facelet strings (URFDLB), sticker-level move engine |
| `src/core/validate.ts` | Colour counts, real pieces, each piece once, twist / flip / parity checks with readable errors |
| `src/core/orient.ts` | `assemble(scans)`: faces in any order and rotation (+ optional neighbour strip) → every valid cube state |
| `src/core/scramble.ts` | Kociemba two-phase solve (`cubejs`), invert, self-check that the scramble rebuilds the input |
| `src/vision/grid.ts` | A 3 × 3 face placed by position, size and turn, and its measurements: how flat each cell is, how strong the outline around the face is, and how clearly the seams between the cells show |
| `src/vision/faceSearch.ts` | `findFace(frame)`: tries every position, size and turn on a shrunk frame (integral images), keeps placements with flat cells and an outline, fine-tunes the best; a one-colour face must also show seams |
| `src/vision/detect.ts` | `detectFace(frame)`: `findFace`, then 9 Lab colour readings with glare rejection (center on a ring), and a neighbour strip when one shows |
| `src/vision/follow.ts` | `FaceFollower`: follows the face from frame to frame (about 4 ms), re-searches the whole frame every third frame or when the colours change, and believes a plain white face only where a cube was just seen; `setKnown` tells it the faces scanned so far, which narrow down what the next one can be |
| `src/vision/color.ts` | sRGB → Lab, sticker distance, nearest-colour reading, `classifyBalanced` (centers as references, exactly 9 per colour, Hungarian assignment) |
| `src/vision/duplicate.ts` | `findDuplicate` to spot a face scanned twice in any rotation; faces with different centers are never the same face |
| `src/vision/tracker.ts` | Free-hand auto-capture: fires once the same nine colours have been read for 350 ms, even while the cube moves; the capture is the average over that time |
| `src/scan/readCube.ts` | 6 captures → cube: centers name the faces, exactly 9 per colour, strips matched by colour proportions, `assemble()`, best guess for manual fixing |
| `src/timer/machine.ts` | Timer state machine: inspection, hold-to-ready, false starts, +2 / DNF from inspection |
| `src/timer/stats.ts` | Solve records, time formatting, WCA averages (5% trimmed, DNF rules), rolling and best aoN |
| `src/timer/cstimer.ts` | csTimer export / import (all sessions) |
| `src/timer/store.ts` | Solve storage: IndexedDB, in-memory fallback; one interface for SQLite later |
| `src/solve/types.ts`, `methods.ts` | Method interface (settings definitions + `solve`) and the method registry |
| `src/solve/pieces.ts` | Piece lookup on a 54-sticker array, relative to the current centers |
| `src/solve/mask.ts` | cubing.js stickering masks per step (any cross colour) |
| `src/solve/cfop/cross.ts` | Optimal cross: 24⁴ distance table by BFS. Optimal XCross (cross + one pair): iterative deepening, cut by the cross table and a 24⁴ table per slot. Of the shortest solutions, the easiest to execute |
| `src/solve/cfop/grip.ts` | Regrip model: each hand's thumb is in front, on top or on the bottom; a table of the turns each hand reaches from there; the fewest regrips for a move sequence, with the first grip and where to regrip. The table and the two costs are the place to adjust it to your own finger tricks |
| `src/solve/cfop/f2l.ts` | F2L pairs: y-turn to front-right or front-left (whichever is shorter), take stuck pieces out, then the case's most-voted SpeedCubeDB algorithm with an AUF (all 150 pair placements for each side); the 41 cases are in `algs/f2l.ts` |
| `src/solve/cfop/f2lAdvanced.ts` | Advanced F2L: per-slot trigger tables for all 576 pair places (triggers from R, L, F, U and wide/slice r, l, f, S; never B), stuck pieces handled in the same search, every pair order tried, pseudo-slotting (all four pairs made with the bottom layer turned by D, D2 or D') used when it saves moves |
| `src/solve/cfop/ll.ts`, `algs/` | OLL (57, or 3 + 7 for 2-look) and PLL (21, or 2 + 4); cases recognised by running each algorithm backwards, with pre / post AUF |
| `src/solve/cfop/index.ts` | CFOP: tries every allowed cross colour in all 4 holds, keeps the shortest, counting each regrip in the cross as 3 extra moves and each B turn after the first move as 5 |
| `src/solve/beginner/index.ts` | Beginner method: each step played on the cube to choose the case, cube turn and number of repeats; never a B turn: the cube is turned instead. The cross edge by edge: the slot turned to the front, then a distance table for each set of cross edges with U, R, F, D, L only (`solveCrossEdge` in `cfop/cross.ts`) |
| `src/i18n/` | `t(key, params)` with plural forms; `locales/en.ts` holds every key, the other languages load on demand (one chunk each). Solver texts are made in the page's language: the worker gets it with each request |
| `demo/i18n.ts` | Page language (`?lang=`, saved choice, browser), `data-i18n` attributes in the HTML, the language picker |
| `demo/index.html`, `demo/app.ts` | The one page and its shell: Cube, Learn and Timer are views picked by the URL hash (`#cube`, `#learn`, `#timer`), so switching never reloads; each view's code loads on first use and is told when it is shown or hidden (camera off, playback and timing stopped) |
| `demo/tour.ts` | Guided tour of the three tabs, opened from the Tour button in the header (it never opens by itself) |
| `demo/learn.ts`, `demo/settings.ts` | Learn view: cube input, settings view, step list and viewer (`learn.html` redirects to `#learn`) |
| `demo/timer.ts`, `demo/chart.ts` | Timer view: scramble + preview, timing pad, stats, history chart, solve table (`timer.html` redirects to `#timer`) |
| `demo/scan.ts` | Scan panel of the Cube view (loaded when opened): free-hand detection, overlay, live reading, six captured-face slots; also upload of several photos (read one after another) or a video (played like the camera) |
| `demo/main.ts` | Cube view: scan, edit (2D net, Solved / Random) or review a scanned cube, then Generate, scramble text and a `cubing.js` 3D viewer; the solver runs in a Web Worker |
| `tests/` | Cube, solver and timer tests; `scan-real.test.ts` runs the scanner on the real photos in `tests/fixtures` |

## Notes

- **No OpenCV.js.** The plan named it for finding the sticker grid; the vision code here is plain
  TypeScript instead of a ~10 MB download.
- **Scanner tests use real photos** (`tests/fixtures`): a hand-held stickerless cube and an
  overexposed stickered cube, cube-free views, and a phone video of the
  cube being turned by hand (five of them, in different light, two of a nearly solved cube,
  replayed frame by frame the way the page does it). Each photo is shrunk to video sizes and the whole cube must come out
  right. The earlier synthetic-image tests passed while real cubes failed, so they are gone.

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
- **A side that is all one colour** (a solved side) has no colour changes inside it to go by, so it
  is found by its outline (a clear step on at least 11 of its 12 outer cell edges) and by the
  seams between its nine pieces. A floor tile can have both, so a vivid side is accepted as it is,
  and a white one only where a cube was seen in the last 4 seconds, or once two scanned faces
  show no white at all (see below). Show another face first if the white side is solved.
- **One sticker is not a solved side.** A single sticker of a scrambled face is also a flat square
  with other colours all round it. While a layer was being turned, or the face was tilted, no
  whole face was found and one sticker was reported as a solved side instead: in 4 frames of the
  test videos, and a still photo of such a moment was captured as a face. What a sticker lacks is
  seams. On each of the 12 borders between cells the scanner measures how far the colour strays
  from a straight blend of the two cells (a dark groove, or the bright rounded edge of a piece),
  and compares that with the same measurement across the middle of the cells, where glare and
  noise bend the colour too. On the real photos and videos, none of 1,800 single stickers passes,
  and the solved white side passes in every frame down to a face 50 px wide.
- **Repeats.** The light on a turning cube changes, so the same face read twice is not the same
  numbers (on real video: up to 35 apart on one sticker, 24 on average). Two different faces
  nearly always have a sticker 90 or more apart. A repeat is a face with no sticker far off.
  The exception is red against orange, which are closer than that: on a nearly solved cube the
  red and the orange side can show the same pattern (one corner and one edge out of place on
  each), and the red side was refused as a repeat of the orange one. A center never moves, so two
  faces whose centers differ are two faces, and the centers are named together with every sticker
  scanned so far, which is what separates red from orange.
- **The scanned faces help find the next one.** Each captured face is passed back to the detector
  (`FaceFollower.setKnown`), which then knows three things. A colour that already shows on
  another face cannot fill a whole side, so a one-colour "face" of it is not a face. A colour on
  none of two or more scanned faces has its side solved and still to come: that side is then
  accepted with the outline missing on one of its four sides (a white side held over a pale floor
  has none where only the floor is behind it), and without the cube-seen-here test. And the cube
  stays about the size it was scanned at, so anything under half that size is not a whole face.
  The last one matters on a nearly solved cube: while it is turned, two or three stickers of one
  colour side by side look like a small solved side, seams included. In the two videos of such a
  cube, without this the white side is not captured and five such blocks are reported; with it
  all six faces are captured and none are.
- **A large logo.** The search runs on a frame shrunk to 160 px, where a logo covering most of
  the white center turns that cell grey. The face then looked like one with two colours, failed
  that test once measured properly, and was never tried as a solved side. Whether a face is all
  one colour now goes by its 8 outer cells; one whose center alone differs is tried both ways.
- **Preview colours.** Before the whole cube is known, stickers are named by hue. This cube's red
  sits at hue -7 to 17 and its orange at 23 to 45 depending on the light, so the boundary between
  them is set by the gap between the reddish stickers in view (within a face, and across the
  faces captured so far) when there are two groups. In low light a red goes pale; with an orange
  in view to compare against it is still named red.
- **Free-hand limits.** White stickers against a white background weaken the outline. The fit is a
  square, so a face tilted far away from the camera is read less reliably. A view held between
  two faces can be captured as a face; the cube then does not validate. A solved side needs its
  seams to show, so it is not found when it is very small in the picture or out of focus.
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
  full; about 48 with all 6 cross colours allowed. Advanced F2L takes about 21 moves instead of 26; the advanced cross (XCross, about 7 moves) saves about 3 moves
  with standard F2L and about 1 with advanced F2L
  (about 50 in total with full OLL / PLL, 44 with all colours). Each solve takes 2-10 ms in the worker.
- **Regrips in the cross**: `grip.ts` estimates the regrips a sequence needs from where each
  thumb is (front, top or bottom) and which turns the fingers reach from there. It is a model of
  the usual right-handed finger tricks, not a measurement. Step 0 picks the side in front, and of
  the shortest crosses the one, that is easiest: a regrip counts as 3 extra moves and a B turn as
  5 more, even within reach (after R or L'), since cubers would sooner turn the cube than do one.
  A B turn as the very first move is free: the hand is put in place for it during inspection.
  With one cross colour about 85% of crosses (75% of XCrosses) have no B turn after the first
  move and about 1% have two (20% and 25-30% when only the length counted); about 75% (60%) need
  no regrip. It costs 0.2-0.8 moves per solve.
- **F2L algorithms** (standard) are the most-voted ones on [SpeedCubeDB](https://speedcubedb.com/a/3x3/F2L)
  for the 41 cases, front-right and front-left (`src/solve/cfop/algs/f2l.ts`). The case each algorithm
  solves is worked out by undoing it on a solved cube, so the table needs no hand-made case setups, and
  the tests check that every pair placement is covered and the cross and other slots are kept.
- **Deploys:** Cloudflare builds and publishes the site (`npm run build`, output in `dist/`) at
  https://solve-rubik.pages.dev/.
  `.github/workflows/test.yml` runs the tests and a build on every push and pull request; it
  does not deploy.

## License

[MIT](LICENSE). Found a bug? [Open an issue](https://github.com/ductm54/rubik_solver/issues).
