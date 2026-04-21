export const SPECIALIST_SPECIALTIES = [
    "Speech-Language Pathology",
    "Occupational Therapy",
    "Physical Therapy",
    "Applied Behavior Analysis (ABA)",
    "Developmental Psychology",
] as const;

export type SpecialistSpecialty = (typeof SPECIALIST_SPECIALTIES)[number];

/**
 * Maps the discipline/practice name (stored in DB) to practitioner title.
 * Use practice name when referring to the field; practitioner name when referring to a person.
 */
export const PRACTITIONER_TITLES: Record<string, string> = {
    "Speech-Language Pathology": "Speech-Language Pathologist",
    "Occupational Therapy": "Occupational Therapist",
    "Physical Therapy": "Physical Therapist",
    "Applied Behavior Analysis (ABA)": "Behavior Analyst (ABA)",
    "Developmental Psychology": "Developmental Psychologist",
};

/** Returns the practitioner title for a given specialty, falling back to the original string. */
export function getPractitionerTitle(specialty: string): string {
    return PRACTITIONER_TITLES[specialty] || specialty;
}
