# Move cost research for advanced F2L

Question: is the per-move cost table in `src/solve/cfop/moveCost.ts` well grounded, and is a per-move table enough?

**Short answer.** No public dataset measures how long each move takes. The best grounded source is trangium's Movecount Coefficient Calculator (MCC). Its weights were tuned to make algorithm rankings match one cuber's times, and its code is public. Converted to "R = 1", MCC says the current table is too generous to **U, U2, D and the double turns**. It also says the gap between the cheapest moves and the rest is wider than the current table assumes. The experiment shows that changing the table changes the plan in 60–80% of solves. The gain in execution time is small, though: about 2–5%, and the move count stays almost the same. My recommendation is to switch to the table below, which is MCC-based, and keep the model simple (option c). Pair penalties and grip modelling for wide moves have little benefit compared with their cost.

## 1. Sources

| Source | What it is | Measured or opinion |
|---|---|---|
| trangium, *Movecount Coefficient Calculator*. Thread: https://www.speedsolving.com/threads/movecount-coefficient-calculator-online-tool-to-evaluate-the-speed-of-3x3-algorithms.79025/ · code: https://github.com/trangium/trangium.github.io/blob/master/algSpeed.js (UI: `MovecountCoefficient/index.html`) | Simulates each finger and wrist move by move. Adds per-move time costs plus penalties for overwork, move blocks, destabilising moves and regrips, and picks the cheapest of 5 grips. | **Tuned, not measured per move.** In the thread, the author says the weights were tuned mainly to the author's own alg times and that other cubers may disagree. The only measured part is that the rankings match one person's timings. |
| *Factors in speedcubing performance*, Journal of Emerging Investigators 2022: https://emerginginvestigators.org/articles/21-189 | Frame-by-frame analysis of 69 solve videos plus a survey of 1,385 cubers. TPS correlates with solve time at r = −0.85. How often a solver regrips or rotates is among the strongest predictors of solve time. | **Measured**, but only for whole solves. It gives no per-move timings. I could not fetch the PDF from this sandbox, so these figures come from the search summary. |
| Wikipedia, *Speedcubing* / Roux sections (mirrors) | States that M-slice flicks limit TPS compared with R/U. | Opinion / secondary. |
| General finger-trick teaching (J Perm, CubeSkills, Badmephisto) | Lists R, U, R' and U' as the fastest moves, then D, F', M' and so on. The current tiers already follow this. | Opinion: consensus among coaches, no timings. |

I found no academic paper or forum dataset with per-move times in milliseconds. speedsolving.com and trangium.github.io could not be reached from this sandbox. The MCC weights below were read from the GitHub source, so if the live site was changed later, the defaults there may differ.

### MCC defaults (from `algSpeed.js` signature and UI sliders)

These values are in MCC units, where an index flick = 1:

- wrist quarter turn (R, R', L, L') **0.8**; half-turn multiplier **1.65**, so R2 = 1.32
- U, U' flick **1**; U2 = 1.65 (double flick); push **×1.3**; ring finger (D) **×1.4**
- D2 / F2 / B2 = 1.65 × 1.4 = **2.31**
- F flick 1; F' with the thumb 1.25 (1.8–2.05 after D or from a thumb-on-top grip)
- M' 1; M = push 1.3; M2 1.65
- S and E slices: multiplier **×1.25**, so a flick is 1.25, a push 1.63 and a double 2.06
- B 1 when the hand is in grip (1.45 after U)
- overwork, i.e. reusing the same finger too soon: up to **2.25** (penalty = 2.25 − time since last use)
- move block 0.8; destabilise 0.5; soft regrip 1 plus up to 2 latency; changing the R/L grip +0.65; changing the U/D grip +2.25
- y/z rotation **3.5**, y2 5.8; x rotations are free (they only change the wrist state)

Dividing by 0.8 converts MCC units to R = 1. In those units, U ≈ 1.25, U2 ≈ 2.06, R2 ≈ 1.65, D ≈ 1.75, D2/F2 ≈ 2.9, M ≈ 1.6, M' ≈ 1.25, a regrip ≈ 1.25–3.75 and y ≈ 4.4.

## 2. Proposed table (R = 1)

```ts
/**
 * Execution time in "R = 1" units. Based on trangium's MCC defaults (wrist 0.8, flick 1, push ×1.3,
 * ring ×1.4, half turn ×1.65, S/E ×1.25; divided by 0.8), pulled a little towards the current
 * table where MCC's context penalties (overwork, regrips) are already modelled elsewhere (grip.ts).
 * Wide turns: the face turn plus a small extra for the second layer; MCC does not separate them.
 */
export const MOVE_COST: Record<string, number> = {
  R: 1.0, "R'": 1.0, R2: 1.6,   L: 1.1, "L'": 1.1, L2: 1.8,
  U: 1.1, "U'": 1.1, U2: 1.7,   D: 1.5, "D'": 1.6, D2: 2.6,
  F: 1.4, "F'": 1.3, F2: 2.6,   B: 2.2, "B'": 2.2, B2: 3.0,
  r: 1.1, "r'": 1.1, r2: 1.8,   l: 1.3, "l'": 1.3, l2: 2.0,
  u: 1.4, "u'": 1.5, u2: 2.2,   d: 2.0, "d'": 2.0, d2: 3.0,
  f: 1.7, "f'": 1.6, f2: 3.0,   b: 2.8, "b'": 2.8, b2: 3.4,
  M: 1.6, "M'": 1.3, M2: 2.1,   S: 1.6, "S'": 1.8, S2: 2.6,   E: 1.6, "E'": 1.6, E2: 2.6,
};
export const SLOW_MOVE_COST = 3.4; // anything unlisted
// Rotations: x 0 (wrist reposition, as in MCC); y, z ≈ 4.4 by MCC, but advanced F2L never rotates.
```

`moveCost` stays as it is: it looks up `MOVE_COST[formatMove(m)] ?? SLOW_MOVE_COST`. Notes on each value, with ⚠ marking places where the sources disagree:

- **R, R' = 1** by definition. **L, L' 1.1**: MCC treats them the same as R (0.8). The extra 0.1 is for a right-handed solver's weaker left wrist. This is my opinion. ⚠
- **U, U' 1.1**: MCC gives 1.25 (a flick is slower than a wrist turn), while the current table and coaches' consensus give 1.0. ⚠ I split the difference. In R U R' U' type triggers, a U flick overlaps with the wrist return, which a per-move table cannot express, so the MCC value overstates U inside triggers.
- **U2 1.7** (current 1.1, MCC 2.06) ⚠. **This is the biggest correction.** A double flick is clearly slower than a single flick. Even the fastest double flicks are not as fast as one flick.
- **R2 1.6** (current 1.3, MCC 1.65). A double wrist turn costs about 1.65 quarter turns in MCC, and all the half turns follow that same factor.
- **D 1.5, D' 1.6** (current 1.3, MCC 1.75): ring finger ×1.4. D' is done with the left ring finger, so it gets a little more. **D2 2.6** (MCC 2.9).
- **F' 1.3** (thumb push from home grip) and **F 1.4** (index finger from below, which needs the R' grip; grip.ts already charges the regrip). **F2 2.6** (MCC 2.9).
- **B 2.2, B2 3.0**: kept high. Advanced F2L does not generate B turns, and grip.ts adds `BACK_TURN_COST`.
- **r 1.1, r' 1.1, r2 1.8**: a wrist turn over two layers. MCC treats r like R. +0.1 for the heavier turn.
- **l 1.3, l2 2.0**: the left wrist over two layers, less practised.
- **u 1.4, u' 1.5, u2 2.2**: a flick over two layers is noticeably heavier than U. u' needs the left index finger.
- **f 1.7, f' 1.6, f2 3.0**: F plus the extra weight of a second layer.
- **d 2.0, b 2.8**: these are not generated, and the values are only there for completeness.
- **M' 1.3, M 1.6, M2 2.1**: ring-finger flick vs push (MCC 1.25 / 1.63 / 2.06), unchanged in substance.
- **S 1.6, S' 1.8, S2 2.6; E 1.6, E' 1.6, E2 2.6**: MCC slice ×1.25 (flick 1.56, push 1.95, double 2.58). S' is the push for a right-handed solver. ⚠ Which direction counts as the push depends on the solver.

## 3. Context effects a per-move table cannot express

- **Overlapping triggers** (R U R' U', r U R', R U' R'): in MCC the next finger starts while the wrist is still returning. Its −0.5 "same-finger cancellation" bonus for R U' R and the U/D merge `max(a, b) + 0.5` capture this. So a trigger costs less than the sum of its moves. Every F2L plan is made of these triggers, so this bonus mostly cancels out when two plans are compared.
- **Slow transitions** (R F, F R, R D', U L, f R). In MCC these appear as grip changes (+0.65 for R/L, +2.25 for U/D) and destabilise penalties (+0.5). Advanced F2L plans contain on average **~1.0 R↔F, ~1.1 f↔R and ~5 U↔L transitions per solve** (100 scrambles, current table). The U↔L transitions come from back-left inserts, which are ambidextrous and fast, so they need no penalty. Only R↔F and f↔R matter, about 2 per solve.
- **Double turns**: a two-flick U2 vs a wrist U2. The table above already charges 1.7, which is about the average of the two styles.
- **Regrips**: MCC charges 1 + up to 2 latency (in MCC units), which is **1.25–3.75 R**. `grip.ts` uses `REGRIP_COST = 3`, which is consistent with that. A y rotation is about **4.4 R** by MCC, and the JEI study finds that regrip and rotation frequency is one of the strongest predictors of solve time. These are the most expensive things in a solve, so it is worth getting them right.

### Recommendation

- **(c) Keep a simple per-move table, updated as above. Recommended now.** It is cheap, transparent and easy to edit, and it captures the effects that matter most: U2, the double turns and D. The experiment below shows it changes 60% of plans for a gain of about 2% in time.
- **(a) Transition penalties.** Add about +0.5 R for R↔F, F↔R, R↔D and f↔R adjacent pairs, as a 2-move lookup in `turnCost`. With about 2 such transitions per solve, the most this can gain is about 1 R per solve, roughly 4% of F2L time. I estimate it would change plans in about 20–30% of solves. It is worth doing only if it stays as simple as a small `PAIR_PENALTY` map. This is a medium priority.
- **(b) Extend grip.ts to wide and slice moves.** r and l move the thumb the same way R and L do, so adding them to `WRIST` is a 2-line change. u, f and S would need entries in the reach table. This **matters more than (a)** for correctness, because without it `countRegrips` ignores r and l, which leaves the grip state wrong after an r move (an r moves the thumb exactly like an R). I estimate it would affect plans with wide turns, about 1.8–2.3 wide turns per solve. Low cost, so it is worth doing.
  - **Done in b7d38ee:** r/l are wrist turns, u/u2/f'/f/f2 have reach entries, and advanced F2L adds REGRIP_COST (3) per regrip of each pair's algorithm. Over 100 scrambles regrips fell from about 0.09 to 0.04 per pair (0.35 to 0.15 per solve), for 0.4 more moves.
- Do not try to reimplement the full MCC. It is opinion-tuned, and its many parameters do not improve the ranking of F2L plans in a way anyone could check.

## 4. Experiment

Setup: 100 seeded scrambles (Park–Miller seed 12345, 25 random moves), white cross, then `solveF2LAdvanced(arr, 'white', 'time')` with `MOVE_COST` replaced at runtime by each table. Each table ran in its own vitest process so the trigger and case caches were fresh. Every plan was then scored under all four tables. The script is in `docs/experiments/movecost-experiment.test.ts.txt`. To run it, copy it into `tests/` and run `TABLE=<name> OUT=<dir> npx vitest run tests/<file>`.

Tables: **current**, **proposed** (above), **mcc** (MCC values ÷ 0.8, wide moves = face moves), **uniform** (every move 1, i.e. fewest moves).

Averages per solve (F2L only):

| plan optimised for | moves | regrips | wide/slice | U2 | R2 | F | time (current) | time (proposed) | time (mcc) |
|---|---|---|---|---|---|---|---|---|---|
| current  | 21.64 | 0.65 | 1.83 | 2.20 | 0.33 | 2.71 | **25.51** | 27.59 | 28.75 |
| proposed | 21.71 | **0.54** | 2.32 | 1.43 | 0.18 | 2.35 | 25.67 | **27.02** | 27.78 |
| mcc      | 21.57 | 0.68 | 3.15 | 1.17 | 0.26 | 2.44 | 26.21 | 27.12 | **27.47** |
| uniform  | 21.50 | 0.93 | 3.14 | 1.97 | 0.28 | 2.86 | 26.74 | 28.34 | 29.03 |

Different plan than the current table produces: proposed 60/100, mcc 78/100, uniform 80/100.

What the numbers show:

- **The move count does not depend on the table** (21.5–21.7). Weighting by time costs at most 0.2 moves per solve.
- **The table changes most plans but saves little time.** Optimising for the right table, compared with fewest moves, saves 4.6% (current: 25.51 vs 26.74) to 5.4% (mcc). Using the wrong table costs about 2% (under proposed: 27.02 vs 27.59 with the current plans).
- **Plans are sensitive to how U2 is priced.** U2s drop from 2.2 to 1.4 per solve with the proposed table, replaced by other trigger choices and r or u moves. As a side effect, regrips fall by 17% (0.65 → 0.54), even though the table does not model regrips directly.
- **MCC-style pricing pushes towards more wide and slice turns** (3.15 per solve), because MCC treats r like R. Without an extra cost for wide turns, they appear as often as they do in fewest-move plans.
- These differences are small next to a single regrip (about 3 R) or rotation (about 4.4 R). That is why (b), correct grip tracking for r and l, is worth more than further tuning of individual move costs.

## 5. Final config (reviewed after b7d38ee)

Confirmed with no edits: MOVE_COST as above, SLOW_MOVE_COST 3.4, rotations 0; grip.ts RIGHT_HAND as in b7d38ee (left hand mirrored); REGRIP_COST 3; BACK_TURN_COST 5 (cross only); the first grip is free, and so is regripping between pairs. MCC keeps regrips apart from its move weights, so charging regrips separately counts nothing twice. Any REGRIP_COST from 2 to 4 gives nearly the same plans (6 to 10 of 100 differ); with 0, 57 of 100 differ.
