export const SPECIALIST_SPECIALTIES = [
    "Speech-Language Pathology",
    "Occupational Therapy",
    "Physical Therapy",
    "Applied Behavior Analysis (ABA)",
    "Developmental Psychology",
] as const;

export type SpecialistSpecialty = (typeof SPECIALIST_SPECIALTIES)[number];
