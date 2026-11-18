/** The courses on the Learn tab, in the order the method picker shows them. */
import { BEGINNER, type Course } from './beginner';
import { FEWER } from './fewer';

export const COURSES: Course[] = [
  { id: 'beginner', keys: 'learn', lessons: BEGINNER },
  { id: 'fewer', keys: 'learn.fewer', lessons: FEWER },
];

/** The course a `#learn=<id>` hash asks for; the first one by default. */
export function courseOf(hash: string): Course {
  const id = /^#learn=([\w-]+)/.exec(hash)?.[1];
  return COURSES.find((c) => c.id === id) ?? COURSES[0];
}
