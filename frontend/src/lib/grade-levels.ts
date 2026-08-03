/**
 * Mirrors api/grade_levels.py. These are the same levels the parent onboarding
 * form offers for "Grade / Level", minus "Not yet in school" — a valid answer
 * for a student, never a teaching assignment.
 */
export const GRADE_LEVELS = ['Nursery/Early Years', 'Pre-K/Kinder', 'Primary'] as const;

export type GradeLevel = (typeof GRADE_LEVELS)[number];

const NOT_YET_TOKENS = ['not yet in school', 'not yet', 'not in school', 'none'];
const NURSERY_TOKENS = ['nursery', 'early years', 'early year', 'toddler', 'playgroup', 'daycare'];
const PRE_K_TOKENS = ['pre k', 'prek', 'pre kinder', 'prekinder', 'kinder', 'kg', 'preschool', 'pre school', 'reception'];
const WORD_NUMBERS = ['one', 'first', 'two', 'second', 'three', 'third', 'four', 'fourth', 'five', 'fifth', 'six', 'sixth'];

/** Maps free-text grades to a teachable level; "" when there is no match. */
export function normalizeGradeLevel(value?: string | null): string {
  if (!value) return '';
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  if (NOT_YET_TOKENS.some(token => cleaned.includes(token))) return '';
  if (NURSERY_TOKENS.some(token => cleaned.includes(token))) return 'Nursery/Early Years';
  // Checked after nursery so "pre-nursery" is not read as Pre-K.
  if (cleaned === 'k' || PRE_K_TOKENS.some(token => cleaned.includes(token))) return 'Pre-K/Kinder';
  if (cleaned.includes('primary') || cleaned.includes('elementary')) return 'Primary';

  const digits = cleaned.match(/\d{1,2}/);
  if (digits) {
    const number = parseInt(digits[0], 10);
    return number >= 1 && number <= 6 ? 'Primary' : '';
  }

  if (WORD_NUMBERS.some(word => new RegExp(`\\b${word}\\b`).test(cleaned))) return 'Primary';

  return '';
}

/** True when a teacher's level covers the student's grade. */
export function gradeLevelMatches(teacherGradeLevel?: string | null, studentGrade?: string | null): boolean {
  const target = normalizeGradeLevel(studentGrade);
  if (!target) return false;
  return normalizeGradeLevel(teacherGradeLevel) === target;
}
