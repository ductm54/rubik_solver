/**
 * csTimer export format (JSON):
 *   { "session1": [ [[penaltyMs, timeMs], scramble, comment, unixSeconds], ... ],
 *     "properties": { "sessionData": "<JSON string>" , ... } }
 * penaltyMs is 0, 2000 (+2) or -1 (DNF).
 */
import { t } from '../i18n';
import type { Penalty, Solve } from './stats';

type CsSolve = [[number, number], string, string, number];

export function toCsTimer(solves: Solve[], sessionName = 'Rubik Solver'): string {
  const session1: CsSolve[] = solves.map((s) => [
    [s.penalty === 'DNF' ? -1 : s.penalty === '+2' ? 2000 : 0, Math.round(s.time)],
    s.scramble,
    s.note ?? '',
    Math.floor(s.date / 1000),
  ]);
  return JSON.stringify({
    session1,
    properties: {
      sessionData: JSON.stringify({ 1: { name: sessionName, opt: {}, rank: 1 } }),
    },
  });
}

/**
 * What makes two records the same solve across an export and an import: the format keeps whole
 * seconds for the date and whole milliseconds for the time, so compare at that precision.
 */
export const solveKey = (s: Pick<Solve, 'date' | 'time'>) => `${Math.floor(s.date / 1000)}|${Math.round(s.time)}`;

/** Parse a csTimer export; solves from every session, oldest first. */
export function fromCsTimer(json: string): Solve[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(t('cstimer.notJson'));
  }
  if (!data || typeof data !== 'object') throw new Error(t('cstimer.notExport'));
  const out: Solve[] = [];
  const sessions = Object.keys(data).filter((k) => /^session\d+$/.test(k));
  if (!sessions.length) throw new Error(t('cstimer.noSessions'));
  for (const key of sessions) {
    const list = (data as Record<string, unknown>)[key];
    if (!Array.isArray(list)) continue;
    list.forEach((row, i) => {
      if (!Array.isArray(row) || !Array.isArray(row[0])) return;
      const [pen, time] = row[0] as [number, number];
      if (typeof time !== 'number' || typeof pen !== 'number') return;
      const penalty: Penalty = pen === -1 ? 'DNF' : pen > 0 ? '+2' : 'none';
      const date = typeof row[3] === 'number' ? row[3] * 1000 : 0;
      out.push({
        id: `cs-${key}-${i}-${date}`,
        time,
        penalty,
        scramble: typeof row[1] === 'string' ? row[1] : '',
        note: typeof row[2] === 'string' && row[2] ? row[2] : undefined,
        date,
        source: 'import',
      });
    });
  }
  return out.sort((a, b) => a.date - b.date);
}
