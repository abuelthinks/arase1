from __future__ import annotations

from dataclasses import dataclass, field

from api.models import (
    GeneratedDocument,
    MultidisciplinaryAssessment,
    MultidisciplinaryProgressTracker,
    ParentProgressTracker,
    SpedProgressTracker,
    Student,
    StudentAccess,
)


@dataclass
class WorkflowReconciliationResult:
    student_id: int
    student_name: str
    original_status: str
    target_status: str | None = None
    applied: bool = False
    stale_iep_doc_ids: list[int] = field(default_factory=list)
    deleted_iep_doc_ids: list[int] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def has_specialist_assignments(student: Student) -> bool:
    return StudentAccess.objects.filter(student=student, user__role="SPECIALIST").exists()


def get_latest_finalized_assessment(student: Student, cycle=None):
    qs = MultidisciplinaryAssessment.objects.filter(
        student=student,
        finalized_at__isnull=False,
    )
    if cycle is not None:
        qs = qs.filter(report_cycle=cycle)
    return qs.order_by("-finalized_at", "-created_at").first()


def has_finalized_multidisciplinary_assessment(student: Student, cycle=None) -> bool:
    return get_latest_finalized_assessment(student, cycle) is not None


def expected_assessment_status(student: Student) -> str:
    if has_finalized_multidisciplinary_assessment(student):
        return "ASSESSED"
    if has_specialist_assignments(student):
        return "ASSESSMENT_SCHEDULED"
    return "PENDING_ASSESSMENT"


def cycle_has_downstream_artifacts(student: Student, cycle) -> bool:
    if cycle is None:
        return False
    return any([
        ParentProgressTracker.objects.filter(student=student, report_cycle=cycle).exists(),
        MultidisciplinaryProgressTracker.objects.filter(student=student, report_cycle=cycle).exists(),
        SpedProgressTracker.objects.filter(student=student, report_cycle=cycle).exists(),
        GeneratedDocument.objects.filter(
            student=student,
            report_cycle=cycle,
            document_type="MONTHLY",
        ).exists(),
    ])


def reconcile_student_assessment_state(
    student: Student,
    *,
    apply: bool = False,
    delete_stale_iep_drafts: bool = False,
) -> WorkflowReconciliationResult:
    result = WorkflowReconciliationResult(
        student_id=student.id,
        student_name=str(student),
        original_status=student.status,
    )
    expected_status = expected_assessment_status(student)

    if student.status in {"PENDING_ASSESSMENT", "ASSESSMENT_SCHEDULED", "ASSESSED"}:
        if student.status != expected_status:
            result.target_status = expected_status
    elif student.status == "ENROLLED" and not has_finalized_multidisciplinary_assessment(student):
        active_cycle = getattr(student, "report_cycles", None)
        cycle = active_cycle.filter(is_active=True).order_by("-created_at").first() if active_cycle else None
        if cycle_has_downstream_artifacts(student, cycle):
            result.warnings.append(
                "Student is ENROLLED without a finalized multidisciplinary assessment and has downstream progress artifacts."
            )
        else:
            result.target_status = "ASSESSMENT_SCHEDULED" if has_specialist_assignments(student) else "PENDING_ASSESSMENT"
            result.warnings.append(
                "Student was prematurely enrolled without a finalized multidisciplinary assessment."
            )

    stale_iep_docs = list(
        GeneratedDocument.objects.filter(student=student, document_type="IEP")
        .select_related("report_cycle")
        .order_by("created_at")
    )
    for doc in stale_iep_docs:
        if has_finalized_multidisciplinary_assessment(student, doc.report_cycle):
            continue
        result.stale_iep_doc_ids.append(doc.id)
        if delete_stale_iep_drafts and doc.status == "DRAFT" and not cycle_has_downstream_artifacts(student, doc.report_cycle):
            if apply:
                doc.delete()
                result.deleted_iep_doc_ids.append(doc.id)
        else:
            result.warnings.append(
                f"IEP document {doc.id} exists for cycle {doc.report_cycle_id} without a finalized multidisciplinary assessment."
            )

    if apply and result.target_status and result.target_status != student.status:
        student.status = result.target_status
        student.save(update_fields=["status"])
        result.applied = True

    return result
