/** Registered solving methods. Add new ones here; the settings view is built from their defs. */
import { CFOP } from './cfop';
import type { MethodDef } from './types';

export const METHODS: MethodDef[] = [CFOP];

export function getMethod(id: string): MethodDef {
  return METHODS.find((m) => m.id === id) ?? METHODS[0];
}
