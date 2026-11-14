# Rubik Solver

A cube scanner + timer app: turn the cube freely in front of the camera, the app reads all 6
faces, works out a scramble that reproduces that exact state, and times your solve.

This repo is at **Phase 0**: the core cube logic with no camera yet. Type in 54 colours, get a
valid scramble. Plan: [Rubik Cube Scanner App — Plan](https://claude.ai/artifact/K7kwAwiXBCjcMvoC7A37Yv).

**Live demo:** https://ductm54.github.io/rubik_solver/

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
| `demo/` | 2D net editor, Generate button, scramble text and a `cubing.js` 3D viewer; the solver runs in a Web Worker |
| `tests/` | Move-engine checks and the five Phase 0 acceptance tests |

## Notes

- **Orientation search** tries all 4⁶ = 4,096 face rotations, not 4⁵: rotating one face's
  stickers changes the cube, so the first face can't be fixed for free. It's still ~10 ms.
- **Neighbour strips** pin the rotation with no search for ~98% of cubes; when a strip matches a
  wrong row by coincidence, a handful (≤ 4) of candidates are checked. The answer was unique in
  every test run.
- **Deploys:** `.github/workflows/deploy.yml` runs tests, builds and publishes `dist/` to GitHub
  Pages on every push to `main` or `claude/**`. In the repo's **Settings → Pages**, set
  **Source** to **GitHub Actions** once.
