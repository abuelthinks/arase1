/**
 * Centralized TypeScript types for the application.
 * Import from '@/types' in components.
 */

import type { SpecialistSpecialty } from "@/lib/specialties";

// ─── User & Auth ────────────────────────────────────────────────────────────

export type Role = "ADMIN" | "TEACHER" | "SPECIALIST" | "PARENT";

export interface UserPayload {
    user_id: number;
    role: Role;
    
    first_name?: string;
    last_name?: string;
    email?: string;
    specialty?: SpecialistSpecialty | "";
    specialties?: SpecialistSpecialty[];
    languages?: string[];
    specialist_onboarding_complete?: boolean;
    specialist_onboarding_missing?: string[];
}

export interface UserProfile {
    id: number;
    
    email: string;
    role: Role;
    first_name: string;
    last_name: string;
    specialty: SpecialistSpecialty | "";
    languages?: string[];
    specialist_onboarding_complete?: boolean;
    specialist_onboarding_missing?: string[];
    assigned_students_count: number;
    assigned_student_names: string[];
    assigned_students: StudentSummary[];
}

// ─── Student ────────────────────────────────────────────────────────────────

export type StudentStatus =
    | "PENDING_ASSESSMENT"
    | "ASSESSMENT_SCHEDULED"
    | "ASSESSED"
    | "ENROLLED"
    | "ARCHIVED";


export interface Student {
    id: number;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    grade: string;
    status: string; // Display version from get_status_display()
    gender?: string;
    primary_language?: string | string[];
    parent_guardian_name?: string;
}

export interface StudentSummary {
    id: number;
    first_name: string;
    last_name: string;
    grade: string;
    status: StudentStatus;
}

// ─── Report Cycle ───────────────────────────────────────────────────────────

export interface ReportCycle {
    id: number;
    start_date: string;
    end_date: string;
}

// ─── Form Statuses ──────────────────────────────────────────────────────────

export interface FormStatus {
    submitted: boolean;
    id: number | null;
}

export interface FormStatuses {
    parent_assessment: FormStatus;
    multi_assessment: FormStatus;
    sped_assessment: FormStatus;
    parent_tracker: FormStatus;
    multi_tracker: FormStatus;
    sped_tracker: FormStatus;
}

// ─── Generated Documents ────────────────────────────────────────────────────

export type DocumentType = "IEP" | "ASSESSMENT" | "MONTHLY";

export interface GeneratedDocument {
    id: number;
    type: DocumentType;
    file_url: string;
    created_at: string;
    has_iep_data: boolean;
}

// ─── Staff ──────────────────────────────────────────────────────────────────

export interface StaffMember {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    
    role: Role;
    specialty: SpecialistSpecialty | "";
    languages?: string[];
    caseload: number;
    recommended: boolean;
}

// ─── Invitation ─────────────────────────────────────────────────────────────

export interface Invitation {
    id: number;
    email: string;
    token: string;
    role: Role;
    is_used: boolean;
    created_at: string;
}

// ─── Student Profile (composite API response) ───────────────────────────────

export interface StudentProfileData {
    student: Student;
    active_cycle: ReportCycle | null;
    form_statuses: FormStatuses;
    generated_documents: GeneratedDocument[];
    assigned_staff: { id: number; role: Role }[];
}

// ─── Async Task ─────────────────────────────────────────────────────────────

export interface AsyncTaskResponse {
    message: string;
    task_id: string;
}
