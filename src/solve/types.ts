/**
 * Shared shapes for step-by-step solving methods (CFOP now; Roux, ZZ, beginner later). A method
 * describes its own settings, so the settings view is built from this data, not per method.
 */
import type { CubeState } from '../core/cube';

export interface SolveStep {
  /** Stage id, e.g. 'cross', 'f2l', 'oll', 'pll'. */
  stage: string;
  /** Short heading, e.g. "F2L 2 · front-left slot". */
  title: string;
  /** Named case, e.g. "OLL 27 · Sune". */
  caseName?: string;
  /** How to recognise the case or what to look for. */
  hint?: string;
  /** How to read the cube before this step and why it is done this way, one point per entry. */
  tips?: string[];
  /** Moves for this step in WCA notation (may start with a rotation). */
  alg: string;
  /** Move count without rotations. */
  moves: number;
  /** cubing.js stickering mask for this step (see twisty `experimental-stickering-mask-orbits`). */
  mask?: string;
}

export interface SolvePlan {
  method: string;
  steps: SolveStep[];
  /** Total moves without rotations. */
  moves: number;
  /** One line such as "Cross on white". */
  note?: string;
}

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingDef {
  key: string;
  label: string;
  help?: string;
  /** 'choice' = pick one, 'multi' = pick one or more. */
  kind: 'choice' | 'multi';
  /** 'multi' only: nothing picked is allowed. */
  allowEmpty?: boolean;
  options: SettingOption[];
}

export type SettingValues = Record<string, string | string[]>;

export interface MethodDef {
  id: string;
  name: string;
  description: string;
  settings: SettingDef[];
  defaults: SettingValues;
  solve(state: CubeState, settings: SettingValues): SolvePlan;
}
