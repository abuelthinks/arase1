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

/**
 * Plain-language explanation of what each discipline actually works on, for
 * family-facing screens. Deliberately jargon-free — a parent should not need to
 * know what "Developmental Psychology" covers to understand their child's team.
 */
export const SPECIALTY_DESCRIPTIONS: Record<string, string> = {
    "Speech-Language Pathology": "Understanding and using language, speech sounds, and getting needs across.",
    "Occupational Therapy": "Everyday skills — handwriting, dressing, feeding, and handling sensory input.",
    "Physical Therapy": "Movement, strength, balance, and coordination.",
    "Applied Behavior Analysis (ABA)": "Building helpful routines and easing behaviors that get in the way of learning.",
    "Developmental Psychology": "Thinking, emotions, and social development, and how best to support them.",
};

/** Returns the plain-language description for a specialty, or an empty string. */
export function getSpecialtyDescription(specialty: string): string {
    return SPECIALTY_DESCRIPTIONS[specialty] || "";
}
