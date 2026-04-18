"""
Monthly Report Generator — Collects progress tracker data, calls Gemini AI,
returns a structured Monthly Progress Report JSON.
"""
import json
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers (shared with iep_generator)
# ---------------------------------------------------------------------------

def _safe(obj, *keys, default=""):
    val = obj
    for k in keys:
        if isinstance(val, dict):
            val = val.get(k, default)
        else:
            return default
    return val if val else default


def _list_join(lst):
    if isinstance(lst, list):
        return ", ".join(str(x) for x in lst if x)
    return str(lst) if lst else ""


def _extract_gas_scores(fd):
    """
    Collect all GAS scores from a flattened form dict.
    Handles both:
      - dynamic_goal_N  (IEP-linked, set by frontend)
      - gas_goal_N      (legacy static keys)
    Returns a list of "Goal N: <score>" strings.
    """
    scores = []
    i = 1
    while True:
        val = fd.get(f'dynamic_goal_{i}') or fd.get(f'gas_goal_{i}')
        if val:
            scores.append(f"Goal {i}: {val}")
            i += 1
        else:
            break
    # Also pick up goal_comments / gas_comments
    comments = fd.get('gas_comments') or fd.get('goal_comments', '')
    if comments:
        scores.append(f"Comments: {comments}")
    return scores


def _flatten_form_data(fd):
    """
    Flatten section-keyed form data into a single dict.
    Handles three formats:
      1. { 'v2': { section_a: {...}, section_b: {...} } }  ← old v2 wrapper
      2. { section_a: {...}, section_b: {...} }             ← current frontend format
      3. { communication_notes: ..., ... }                  ← legacy flat format
    """
    if not fd or not isinstance(fd, dict):
        return {}

    # Unwrap v2 wrapper if present
    if 'v2' in fd and isinstance(fd['v2'], dict):
        fd = fd['v2']

    # Check if this is section-keyed (keys like 'section_a', 'section_b', ...)
    is_section_keyed = any(k.startswith('section_') for k in fd.keys())

    if is_section_keyed:
        flat = {}
        for sec_key, sec_val in fd.items():
            if isinstance(sec_val, dict):
                flat.update(sec_val)
        return flat

    # Already flat
    return fd


def _collect_form_data(inputs):
    result = {}
    for key, obj in inputs.items():
        if obj and hasattr(obj, 'form_data') and obj.form_data:
            # Prefer translated data if available, otherwise fallback to original form_data
            data = getattr(obj, 'translated_data', None) or obj.form_data
            result[key] = _flatten_form_data(data)
        else:
            result[key] = {}
    return result



# ---------------------------------------------------------------------------
# Build prompt for Gemini
# ---------------------------------------------------------------------------

def _build_monthly_prompt(student, cycle, pt, mt, st, iep_goals):
    """Build a structured prompt from the three progress tracker datasets."""

    lines = [
        "You are an expert special education coordinator generating a Monthly Progress Report.",
        "Use ONLY the data provided below. Do NOT invent observations or data not mentioned.",
        "Write in clear, professional, empathetic language suitable for parents and educators.",
        "",
        "=== STUDENT INFO ===",
        f"Name: {student.first_name} {student.last_name}",
        f"Date of Birth: {student.date_of_birth}",
        f"Grade/Level: {student.grade}",
        f"Report Cycle: {cycle.start_date} to {cycle.end_date}",
        "",
    ]

    # IEP Goals context (if available)
    if iep_goals:
        lines.append("=== CURRENT IEP GOALS ===")
        for g in iep_goals:
            lines.append(f"  {g.get('id', '')}: [{g.get('domain', '')}] {g.get('goal', '')}")
        lines.append("")

    # Parent Tracker data
    if pt:
        lines.append("=== PARENT PROGRESS TRACKER DATA ===")
        lines.append(f"Person Filing: {_safe(pt, 'person_filling_form')}")
        lines.append(f"Month of Tracking: {_safe(pt, 'week_of_tracking')}")
        lines.append(f"Communication Methods: {_list_join(_safe(pt, 'communication_methods', default=[]))}")
        lines.append(f"Communication Actions: {_list_join(_safe(pt, 'communication_actions', default=[]))}")
        lines.append(f"Communication Notes: {_safe(pt, 'communication_notes')}")
        lines.append(f"Interaction With People: {_list_join(_safe(pt, 'interaction_with_people', default=[]))}")
        lines.append(f"Behavior Observed: {_list_join(_safe(pt, 'behavior_observed', default=[]))}")
        lines.append(f"Social/Behavior Notes: {_safe(pt, 'social_behavior_notes')}")
        lines.append(f"Feeding: {_list_join(_safe(pt, 'feeding', default=[]))}")
        lines.append(f"Dressing: {_list_join(_safe(pt, 'dressing', default=[]))}")
        lines.append(f"Toileting: {_list_join(_safe(pt, 'toileting', default=[]))}")
        lines.append(f"Daily Living Notes: {_safe(pt, 'daily_living_notes')}")
        lines.append(f"Motor Skills: {_list_join(_safe(pt, 'motor_skills', default=[]))}")
        lines.append(f"Sensory Behaviors: {_list_join(_safe(pt, 'sensory_behaviors', default=[]))}")
        lines.append(f"Motor/Sensory Notes: {_safe(pt, 'motor_sensory_notes')}")
        lines.append(f"Expressed Emotions: {_list_join(_safe(pt, 'expressed_emotions', default=[]))}")
        lines.append(f"Calming Helps: {_list_join(_safe(pt, 'calming_help', default=[]))}")
        lines.append(f"Progress Comparison: {_safe(pt, 'progress_comparison')}")
        lines.append(f"Top Concerns: {_list_join(_safe(pt, 'top_concerns', default=[]))}")
        lines.append(f"Concerns Description: {_safe(pt, 'top_concerns_description')}")
        lines.append(f"Parent Goals: {_list_join(_safe(pt, 'parent_goals', default=[]))}")
        lines.append(f"Parent Goal Statement: {_safe(pt, 'parent_goal_statement')}")
        lines.append("")

    # Specialist (Multidisciplinary) Tracker data
    if mt:
        lines.append("=== SPECIALIST MULTIDISCIPLINARY TRACKER DATA ===")
        lines.append(f"Discipline: {_safe(mt, 'discipline')}")
        lines.append(f"Session Type: {_safe(mt, 'session_type')}")
        lines.append(f"Sessions Completed: {_safe(mt, 'sessions_completed')}")
        lines.append(f"Attendance: {_safe(mt, 'attendance')}")
        lines.append(f"Participation Level: {_list_join(_safe(mt, 'participation_level', default=[]))}")
        lines.append(f"Participation Notes: {_safe(mt, 'participation_notes')}")
        lines.append(f"Communication (SLP): {_list_join(_safe(mt, 'communication', default=[]))}")
        lines.append(f"SLP Notes: {_safe(mt, 'slp_notes')}")
        lines.append(f"Fine Motor/Sensory/ADLs (OT): {_list_join(_safe(mt, 'fine_motor_sensory_adls', default=[]))}")
        lines.append(f"OT Notes: {_safe(mt, 'ot_notes')}")
        lines.append(f"Gross Motor (PT): {_list_join(_safe(mt, 'gross_motor', default=[]))}")
        lines.append(f"PT Notes: {_safe(mt, 'pt_notes')}")
        lines.append(f"ABA Progress: {_list_join(_safe(mt, 'aba_goals', default=_safe(mt, 'psych_goals', default=[])))}")
        lines.append(f"ABA Notes: {_safe(mt, 'aba_notes', default=_safe(mt, 'psych_notes'))}")
        lines.append(
            "Developmental Psychology Progress: "
            + _list_join(_safe(mt, 'developmental_psychology_goals', default=_safe(mt, 'academic_learning', default=[])))
        )
        lines.append(
            "Developmental Psychology Notes: "
            + _safe(mt, 'developmental_psychology_notes', default=_safe(mt, 'sped_notes'))
        )
        lines.append(f"Independent Skills: {_safe(mt, 'independent_skills')}")
        lines.append(f"Behavior Interaction: {_safe(mt, 'behavior_interaction')}")
        lines.append(f"Sensory/Motor Regulation: {_safe(mt, 'sensory_motor_regulation')}")
        lines.append(f"Communication With Adults: {_safe(mt, 'communication_with_adults')}")
        lines.append(f"Functional Notes: {_safe(mt, 'functional_notes')}")
        lines.append(f"GAS Goal 1: {_safe(mt, 'gas_goal_1') or _safe(mt, 'dynamic_goal_1')}")
        lines.append(f"GAS Goal 2: {_safe(mt, 'gas_goal_2') or _safe(mt, 'dynamic_goal_2')}")
        lines.append(f"GAS Goal 3: {_safe(mt, 'gas_goal_3') or _safe(mt, 'dynamic_goal_3')}")
        lines.append(f"GAS Goal 4: {_safe(mt, 'gas_goal_4') or _safe(mt, 'dynamic_goal_4')}")
        lines.append(f"GAS Comments: {_safe(mt, 'gas_comments') or _safe(mt, 'goal_comments')}")
        lines.append(f"Therapy Recommendations: {_list_join(_safe(mt, 'therapy_recommendations', default=[]))}")
        lines.append(f"Home Strategies: {_list_join(_safe(mt, 'home_strategies', default=[]))}")
        lines.append(f"Suggested Activities: {_safe(mt, 'suggested_activities')}")
        lines.append("")

    # Teacher (SPED) Tracker data
    if st:
        lines.append("=== SPED TEACHER TRACKER DATA ===")
        lines.append(f"Shadow Teacher: {_safe(st, 'shadow_teacher')}")
        lines.append(f"Week/Month: {_safe(st, 'week_month_of_tracking')}")
        lines.append(f"Class/Level: {_safe(st, 'class_level')}")
        lines.append(f"Attendance & Participation: {_safe(st, 'attendance_participation')}")
        lines.append(f"Engagement During Lessons: {_safe(st, 'engagement_during_lessons')}")
        lines.append(f"Participation Notes: {_safe(st, 'participation_notes')}")
        lines.append(f"Literacy Progress: {_list_join(_safe(st, 'literacy_progress', default=[]))}")
        lines.append(f"Literacy Notes: {_safe(st, 'literacy_notes')}")
        lines.append(f"Numeracy Progress: {_list_join(_safe(st, 'numeracy_progress', default=[]))}")
        lines.append(f"Numeracy Notes: {_safe(st, 'numeracy_notes')}")
        lines.append(f"Pre-Academic Progress: {_list_join(_safe(st, 'pre_academic_progress', default=[]))}")
        lines.append(f"Pre-Academic Notes: {_safe(st, 'pre_academic_notes')}")
        lines.append(f"Focus & Attention: {_list_join(_safe(st, 'focus_attention', default=[]))}")
        lines.append(f"Task Completion: {_list_join(_safe(st, 'task_completion', default=[]))}")
        lines.append(f"Learning Behavior Notes: {_safe(st, 'learning_behavior_notes')}")
        lines.append(f"Peer Interaction: {_list_join(_safe(st, 'peer_interaction', default=[]))}")
        lines.append(f"Functional Social Skills: {_list_join(_safe(st, 'functional_social_skills', default=[]))}")
        lines.append(f"Social Skills Notes: {_safe(st, 'social_skills_notes')}")
        lines.append(f"Monthly Behavior: {_list_join(_safe(st, 'weekly_behavior', default=[]))}")
        lines.append(f"Emotional Regulation: {_list_join(_safe(st, 'emotional_regulation', default=[]))}")
        lines.append(f"Behavior Notes: {_safe(st, 'behavior_notes')}")
        lines.append(f"Independence Routines: {_list_join(_safe(st, 'independence_routines', default=[]))}")
        lines.append(f"Life Skills: {_list_join(_safe(st, 'life_skills', default=[]))}")
        lines.append(f"Adaptive Skills Notes: {_safe(st, 'adaptive_skills_notes')}")
        lines.append(f"GAS Goal 1: {_safe(st, 'gas_goal_1') or _safe(st, 'dynamic_goal_1')}")
        lines.append(f"GAS Goal 2: {_safe(st, 'gas_goal_2') or _safe(st, 'dynamic_goal_2')}")
        lines.append(f"GAS Goal 3: {_safe(st, 'gas_goal_3') or _safe(st, 'dynamic_goal_3')}")
        lines.append(f"GAS Goal 4: {_safe(st, 'gas_goal_4') or _safe(st, 'dynamic_goal_4')}")
        lines.append(f"GAS Comments: {_safe(st, 'gas_comments') or _safe(st, 'goal_comments')}")
        lines.append(f"Classroom Recommendations: {_list_join(_safe(st, 'classroom_recommendations', default=[]))}")
        lines.append(f"Home Support Recommendations: {_list_join(_safe(st, 'home_support_recommendations', default=[]))}")
        lines.append(f"Teacher Recommendation Notes: {_safe(st, 'teacher_recommendation_notes')}")
        lines.append("")

    # Output instructions
    lines.append("=== INSTRUCTIONS ===")
    lines.append("Generate a Monthly Progress Report as a JSON object with these exact keys:")
    lines.append(json.dumps({
        "report_period": "e.g. Month of March 2026",
        "executive_summary": "2-3 sentence overview of the child's month across all domains",
        "communication_progress": {
            "summary": "paragraph summarizing communication progress this month",
            "highlights": ["key observations"],
            "concerns": ["any concerns noted"]
        },
        "behavioral_social_progress": {
            "summary": "paragraph summarizing behavioral and social progress",
            "highlights": ["key observations"],
            "concerns": ["any concerns noted"]
        },
        "academic_progress": {
            "summary": "paragraph summarizing academic/learning progress this month",
            "highlights": ["key observations"],
            "concerns": ["any concerns noted"]
        },
        "motor_sensory_progress": {
            "summary": "paragraph summarizing motor and sensory progress",
            "highlights": ["key observations"],
            "concerns": ["any concerns noted"]
        },
        "daily_living_independence": {
            "summary": "paragraph summarizing daily living and independence skills",
            "highlights": ["key observations"],
            "concerns": ["any concerns noted"]
        },
        "goal_achievement_scores": [
            {"goal_id": "LTG1", "domain": "Communication", "score": 3, "note": "brief note"},
        ],
        "therapy_session_summary": {
            "discipline": "e.g. Speech-Language Pathology",
            "sessions_completed": 0,
            "attendance": "Present/Late/Absent",
            "key_progress": "summary of therapy progress"
        },
        "parent_observations": {
            "overall_comparison": "e.g. Slightly improved",
            "top_concerns": ["list of parent concerns"],
            "parent_goals": ["list of parent goals for next month"]
        },
        "recommendations": {
            "classroom": ["classroom-level recommendations"],
            "home_program": ["specific home activities for next month"],
            "therapy_adjustments": ["any adjustments to therapy plan"]
        },
        "next_month_focus_areas": ["list of 3-5 focus areas for the coming month"]
    }, indent=2))
    lines.append("")
    lines.append("Base the goal_achievement_scores on the GAS scores provided by therapist and teacher (1-5 scale).")
    lines.append("If data for a section is missing, write 'No data submitted this month' instead of making things up.")
    lines.append("Make recommendations practical and specific to the child's current level.")
    lines.append("Return ONLY valid JSON. No markdown, no explanation, just the JSON object.")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Call Gemini
# ---------------------------------------------------------------------------

def _call_gemini(prompt):
    """Call Google Gemini API using the new genai SDK and return parsed JSON."""
    from google import genai
    from google.genai import types
    from django.conf import settings

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured in settings.")

    client = genai.Client(api_key=api_key)
    
    response = client.models.generate_content(
        model='gemini-2.5-flash-lite',
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.7,
            response_mime_type="application/json",
        )
    )
    raw = response.text.strip()

    # Strip markdown code fences if present
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
        if raw.endswith('```'):
            raw = raw[:-3].strip()

    return json.loads(raw)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def generate_monthly_report(student, cycle, inputs):
    """
    Generate a Monthly Progress Report JSON from progress tracker inputs + Gemini AI.
    """
    forms = _collect_form_data(inputs)
    pt = forms.get('parent_tracker', {})
    mt = forms.get('multi_tracker', {})
    st = forms.get('sped_tracker', {})

    # Try to fetch current IEP goals for context
    iep_goals = []
    from .models import GeneratedDocument
    latest_iep = GeneratedDocument.objects.filter(
        student=student, document_type='IEP'
    ).exclude(iep_data={}).order_by('-created_at').first()
    if latest_iep and latest_iep.iep_data:
        iep_goals = latest_iep.iep_data.get('section5_ltg', [])

    # Build and send prompt
    prompt = _build_monthly_prompt(student, cycle, pt, mt, st, iep_goals)
    logger.info("Calling Gemini for Monthly Report generation (student=%s)", student.id)

    try:
        ai_data = _call_gemini(prompt)
    except Exception as e:
        logger.error("Gemini call failed: %s", e)
        raise

    # Build the complete report structure
    report = {
        "student_info": {
            "student_name": f"{student.first_name} {student.last_name}",
            "date_of_birth": str(student.date_of_birth) if student.date_of_birth else "",
            "grade_level": student.grade or "",
            "report_cycle": f"{cycle.start_date} to {cycle.end_date}",
        },
        "report_period": ai_data.get("report_period", ""),
        "executive_summary": ai_data.get("executive_summary", ""),
        "communication_progress": ai_data.get("communication_progress", {}),
        "behavioral_social_progress": ai_data.get("behavioral_social_progress", {}),
        "academic_progress": ai_data.get("academic_progress", {}),
        "motor_sensory_progress": ai_data.get("motor_sensory_progress", {}),
        "daily_living_independence": ai_data.get("daily_living_independence", {}),
        "goal_achievement_scores": ai_data.get("goal_achievement_scores", []),
        "therapy_session_summary": ai_data.get("therapy_session_summary", {}),
        "parent_observations": ai_data.get("parent_observations", {}),
        "recommendations": ai_data.get("recommendations", {}),
        "next_month_focus_areas": ai_data.get("next_month_focus_areas", []),
    }

    return report
