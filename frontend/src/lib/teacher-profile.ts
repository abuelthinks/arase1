export function isTeacherProfileIncomplete(user?: {
  role?: string;
  teacher_profile_complete?: boolean;
} | null): boolean {
  return user?.role === 'TEACHER' && user.teacher_profile_complete === false;
}

export function teacherProfileMessage(missing?: string[]): string {
  if (!missing || missing.length === 0) {
    return 'Finish your profile so students get matched to you correctly.';
  }

  const labels: Record<string, string> = {
    first_name: 'first name',
    last_name: 'last name',
    languages: 'working languages',
  };

  const readable = missing.map((item) => labels[item] || item);
  return `Finish your profile so students get matched to you correctly. Missing: ${readable.join(', ')}.`;
}
