export const SHARED = 'shared' as const;

export const SLP = 'Speech-Language Pathology';
export const OT = 'Occupational Therapy';
export const PT = 'Physical Therapy';
export const ABA = 'Applied Behavior Analysis (ABA)';
export const DEV_PSY = 'Developmental Psychology';

export type Specialty = typeof SLP | typeof OT | typeof PT | typeof ABA | typeof DEV_PSY;
export type SectionOwner = Specialty | typeof SHARED;

export const ASSESSMENT_SECTION_OWNERS: Record<string, SectionOwner> = {
  A: SHARED,
  B: SHARED,
  C: SLP,
  D: OT,
  E: PT,
  F1: ABA,
  F2: DEV_PSY,
  G: SHARED,
};

export const TRACKER_SECTION_OWNERS: Record<string, SectionOwner> = {
  section_a: SHARED,
  section_b: SHARED,
  section_c_slp: SLP,
  section_c_ot: OT,
  section_c_pt: PT,
  section_c_aba: ABA,
  section_c_developmental_psychology: DEV_PSY,
  section_d: SHARED,
  section_e: SHARED,
  section_f: SHARED,
};

const ALIASES: Record<string, Specialty> = {
  'speech language pathology': SLP,
  'speech-language pathology': SLP,
  'slp': SLP,
  'occupational therapy': OT,
  'ot': OT,
  'physical therapy': PT,
  'pt': PT,
  'applied behavior analysis': ABA,
  'applied behavior analysis (aba)': ABA,
  'aba': ABA,
  'bcba': ABA,
  'developmental psychology': DEV_PSY,
};

export function normalizeSpecialty(value?: string | null): Specialty | '' {
  if (!value) return '';
  const cleaned = value.trim().toLowerCase();
  return (ALIASES[cleaned] as Specialty) || (Object.values({ SLP, OT, PT, ABA, DEV_PSY }).includes(value as Specialty) ? (value as Specialty) : '');
}

export function canEditSection(
  owners: Record<string, SectionOwner>,
  sectionKey: string,
  userSpecialty?: string | string[] | null,
  userRole?: string,
): boolean {
  if (userRole === 'ADMIN') return true;
  const owner = owners[sectionKey];
  if (!owner) return false;
  if (owner === SHARED) return true;
  const list = Array.isArray(userSpecialty)
    ? userSpecialty
    : userSpecialty
      ? [userSpecialty]
      : [];
  return list.some((s) => normalizeSpecialty(s) === owner);
}

export function userSpecialtyList(
  specialties?: string[] | null,
  fallback?: string | null,
): Specialty[] {
  const raw = specialties && specialties.length > 0 ? specialties : (fallback ? [fallback] : []);
  const out: Specialty[] = [];
  for (const value of raw) {
    const normalized = normalizeSpecialty(value);
    if (normalized && !out.includes(normalized)) {
      out.push(normalized);
    }
  }
  return out;
}

export function specialtyShortLabel(owner: SectionOwner): string {
  switch (owner) {
    case SLP: return 'SLP';
    case OT: return 'OT';
    case PT: return 'PT';
    case ABA: return 'ABA';
    case DEV_PSY: return 'Dev. Psych';
    default: return 'Shared';
  }
}
