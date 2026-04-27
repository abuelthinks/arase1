export function isSpecialistOnboardingIncomplete(user?: {
  role?: string;
  specialist_onboarding_complete?: boolean;
} | null): boolean {
  return user?.role === 'SPECIALIST' && user.specialist_onboarding_complete === false;
}

export function specialistOnboardingMessage(missing?: string[]): string {
  if (!missing || missing.length === 0) {
    return 'Complete your profile setup before editing specialist work.';
  }

  const labels: Record<string, string> = {
    first_name: 'first name',
    last_name: 'last name',
    specialty: 'specialty',
    languages: 'working languages',
  };

  const readable = missing.map((item) => labels[item] || item);
  return `Complete your profile setup before editing specialist work. Missing: ${readable.join(', ')}.`;
}
