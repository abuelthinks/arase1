"""
IEP Generator — Collects form data, calls Gemini AI, returns structured IEP JSON
matching the 12-section THERUNI Comprehensive AI-Generated IEP template.
"""
import json
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe(obj, *keys, default=""):
    """Safely traverse nested dicts/lists."""
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

def _flatten_form_data(fd):
    """
    Flatten section-keyed form data into a single dict.
    Handles three formats:
      1. { 'v2': { section_a: {...}, section_b: {...} } }  ← old v2 wrapper
      2. { section_a: {...}, section_b: {...} }             ← current frontend format
      3. { field_name: value, ... }                         ← legacy flat format
    """
    if not fd or not isinstance(fd, dict):
        return {}
    if 'v2' in fd and isinstance(fd['v2'], dict):
        fd = fd['v2']
    if any(k.startswith('section_') for k in fd.keys()):
        flat = {}
        for sec_val in fd.values():
            if isinstance(sec_val, dict):
                flat.update(sec_val)
        return flat
    return fd


def _collect_form_data(inputs):
    """Pull and flatten form data from each input submission."""
    result = {}
    for key, obj in inputs.items():
        if obj and hasattr(obj, 'form_data') and obj.form_data:
            result[key] = _flatten_form_data(obj.form_data)
        else:
            result[key] = {}
    return result



# ---------------------------------------------------------------------------
# Build prompt for Gemini
# ---------------------------------------------------------------------------

def _build_gemini_prompt(student, pa, ma, sa):
    """Build a structured prompt from the three assessment form datasets."""

    lines = [
        "You are an expert special education coordinator generating a comprehensive IEP.",
        "Use ONLY the data provided below. Do NOT invent diagnoses or conditions not mentioned.",
        "Write in clear, professional, empathetic language suitable for parents and educators.",
        "",
        "=== STUDENT INFO ===",
        f"Name: {student.first_name} {student.last_name}",
        f"Date of Birth: {student.date_of_birth}",
        f"Grade/Level: {student.grade}",
        "",
    ]

    # Parent Assessment data
    if pa:
        lines.append("=== PARENT ASSESSMENT DATA ===")
        lines.append(f"Gender: {_safe(pa, 'gender')}")
        lines.append(f"Primary Language: {_list_join(_safe(pa, 'primary_language', default=[]))}")
        lines.append(f"Medical Alerts: {_safe(pa, 'medical_alerts')}")
        lines.append(f"Known Conditions: {_list_join(_safe(pa, 'known_conditions', default=[]))}")
        lines.append(f"Primary Concerns: {_list_join(_safe(pa, 'primary_concerns', default=[]))}")
        lines.append(f"Areas of Concern: {_list_join(_safe(pa, 'areas_of_concern', default=[]))}")
        lines.append(f"Primary Goals: {_safe(pa, 'primary_goals')}")
        # Sensory profile
        sensory = _safe(pa, 'sensory_profile', default={})
        if isinstance(sensory, dict):
            for k, v in sensory.items():
                lines.append(f"Sensory - {k}: {v}")
        # Communication
        comm = _safe(pa, 'communication', default={})
        if isinstance(comm, dict):
            for k, v in comm.items():
                lines.append(f"Communication - {k}: {v}")
        lines.append("")

    # Specialist (Multidisciplinary) Assessment data
    if ma:
        lines.append("=== SPECIALIST MULTIDISCIPLINARY ASSESSMENT ===")
        lines.append(f"Therapist Verification: {_safe(ma, 'a2_verification')}")
        lines.append(f"Correction Notes: {_safe(ma, 'a2_correction_notes')}")
        lines.append(f"Reports Reviewed: {_list_join(_safe(ma, 'a3_reports_reviewed', default=[]))}")
        lines.append(f"Clinical Notes: {_safe(ma, 'a3_notes')}")
        lines.append(f"Developmental Milestones: {_list_join(_safe(ma, 'b1_milestones', default=[]))}")
        lines.append(f"Developmental Concerns: {_list_join(_safe(ma, 'b2_developmental_concerns', default=[]))}")
        # SLP
        lines.append(f"SLP Expressive: {_list_join(_safe(ma, 'c1_expressive', default=[]))}")
        lines.append(f"SLP Receptive: {_list_join(_safe(ma, 'c2_receptive', default=[]))}")
        lines.append(f"SLP Articulation: {_list_join(_safe(ma, 'c3_articulation', default=[]))}")
        lines.append(f"SLP Pragmatics: {_list_join(_safe(ma, 'c4_pragmatics', default=[]))}")
        lines.append(f"SLP Notes: {_safe(ma, 'c_notes')}")
        # OT
        lines.append(f"OT Fine Motor: {_list_join(_safe(ma, 'd1_fine_motor', default=[]))}")
        lines.append(f"OT Sensory: {_list_join(_safe(ma, 'd2_sensory', default=[]))}")
        lines.append(f"OT ADLs: {_list_join(_safe(ma, 'd3_adls', default=[]))}")
        lines.append(f"OT Regulation: {_list_join(_safe(ma, 'd4_regulation', default=[]))}")
        lines.append(f"OT Notes: {_safe(ma, 'd_notes')}")
        # PT
        lines.append(f"PT Gross Motor: {_list_join(_safe(ma, 'e1_gross_motor', default=[]))}")
        lines.append(f"PT Strength: {_list_join(_safe(ma, 'e2_strength', default=[]))}")
        lines.append(f"PT Posture: {_list_join(_safe(ma, 'e3_posture', default=[]))}")
        lines.append(f"PT Motor Planning: {_list_join(_safe(ma, 'e4_motor_planning', default=[]))}")
        lines.append(f"PT Notes: {_safe(ma, 'e_notes')}")
        # Psychology
        lines.append(f"Psych Behavior: {_list_join(_safe(ma, 'f1_behavior', default=[]))}")
        lines.append(f"Psych Emotional: {_list_join(_safe(ma, 'f2_emotional', default=[]))}")
        lines.append(f"Psych Cognitive: {_list_join(_safe(ma, 'f3_cognitive', default=[]))}")
        lines.append(f"Psych Autism Screening: {_list_join(_safe(ma, 'f4_autism', default=[]))}")
        lines.append(f"Psych Notes: {_safe(ma, 'f_notes')}")
        # Summary
        lines.append(f"SLP Summary: {_safe(ma, 'g1_slp_summary')}")
        lines.append(f"OT Summary: {_safe(ma, 'g1_ot_summary')}")
        lines.append(f"PT Summary: {_safe(ma, 'g1_pt_summary')}")
        lines.append(f"Psych Summary: {_safe(ma, 'g1_psych_summary')}")
        lines.append(f"Unified Strengths: {_list_join(_safe(ma, 'g2_strengths', default=[]))}")
        lines.append(f"Unified Needs: {_list_join(_safe(ma, 'g3_needs', default=[]))}")
        lines.append(f"Recommended Frequency: {_list_join(_safe(ma, 'g4_frequency', default=[]))}")
        lines.append(f"Follow-Up Plan: {_list_join(_safe(ma, 'g5_follow_up', default=[]))}")
        lines.append("")

    # Teacher (SPED) Assessment data
    if sa:
        lines.append("=== SPED TEACHER ASSESSMENT ===")
        lines.append(f"Observation Context: {_list_join(_safe(sa, 'b1_observation_context', default=[]))}")
        lines.append(f"General Behavior: {_list_join(_safe(sa, 'b2_general_behavior', default=[]))}")
        lines.append(f"Behavior Notes: {_safe(sa, 'b2_notes')}")
        lines.append(f"Literacy: {_list_join(_safe(sa, 'c1_literacy', default=[]))}")
        lines.append(f"Numeracy: {_list_join(_safe(sa, 'c2_numeracy', default=[]))}")
        lines.append(f"Pre-Academic: {_list_join(_safe(sa, 'c3_pre_academic', default=[]))}")
        lines.append(f"Attention: {_list_join(_safe(sa, 'd1_attention', default=[]))}")
        lines.append(f"Task Completion: {_list_join(_safe(sa, 'd2_task_completion', default=[]))}")
        lines.append(f"Social Skills: {_list_join(_safe(sa, 'e1_social_skills', default=[]))}")
        lines.append(f"Play Skills: {_list_join(_safe(sa, 'e2_play_skills', default=[]))}")
        lines.append(f"Behavior Patterns: {_list_join(_safe(sa, 'f1_behavior_patterns', default=[]))}")
        lines.append(f"Emotional Regulation: {_list_join(_safe(sa, 'f2_emotional_regulation', default=[]))}")
        lines.append(f"Learning Style: {_list_join(_safe(sa, 'g1_learning_style', default=[]))}")
        lines.append(f"Classroom Supports: {_list_join(_safe(sa, 'g2_classroom_supports', default=[]))}")
        lines.append(f"Modifications: {_list_join(_safe(sa, 'h_modifications', default=[]))}")
        lines.append(f"Summary: {_safe(sa, 'i1_summary')}")
        lines.append(f"Strengths: {_list_join(_safe(sa, 'i2_strengths', default=[]))}")
        lines.append(f"Priority Needs: {_list_join(_safe(sa, 'i3_priority_needs', default=[]))}")
        lines.append(f"Frequency: {_list_join(_safe(sa, 'i4_frequency', default=[]))}")
        lines.append(f"Next Steps: {_list_join(_safe(sa, 'i5_next_steps', default=[]))}")
        lines.append("")

    # Output instructions
    lines.append("=== INSTRUCTIONS ===")
    lines.append("Generate a comprehensive IEP as a JSON object with these exact keys:")
    lines.append(json.dumps({
        "section2_background": {
            "developmental_history": "paragraph",
            "classroom_functioning": "paragraph",
            "family_input_summary": "paragraph"
        },
        "section3_strengths": {
            "strengths": ["list of identified strengths"],
            "interests": ["list of interests/motivators"]
        },
        "section4_plop": {
            "communication_slp": {"expressive": "", "receptive": "", "articulation": "", "social_communication": "", "aac_needs": ""},
            "fine_motor_ot": {"fine_motor": "", "sensory_processing": "", "self_care": ""},
            "gross_motor_pt": {"balance_gait": "", "coordination": "", "strength_endurance": ""},
            "behavioral_psych": {"attention": "", "transitions": "", "emotional_expression": "", "triggers": "", "coping_strategies": ""},
            "academic_sped": {"literacy": "", "numeracy": "", "learning_behaviors": "", "task_completion": "", "classroom_participation": ""},
            "adaptive_life_skills": {"routines": "", "independence": "", "toileting": "", "safety_awareness": ""}
        },
        "section5_ltg": [
            {"id": "LTG1", "domain": "Communication", "goal": "", "disciplines": "SLP, SPED"},
            {"id": "LTG2", "domain": "Sensory/Fine Motor/ADL", "goal": "", "disciplines": "OT, SPED"},
            {"id": "LTG3", "domain": "Gross Motor", "goal": "", "disciplines": "PT"},
            {"id": "LTG4", "domain": "Behavior & Emotional Regulation", "goal": "", "disciplines": "Psych, SPED"},
            {"id": "LTG5", "domain": "Academic/Functional Learning", "goal": "", "disciplines": "SPED, OT"},
            {"id": "LTG6", "domain": "Social & Independence", "goal": "", "disciplines": "SPED, Psych, OT"}
        ],
        "section6_sto": [
            {"id": "1.1", "ltg_ref": "LTG1", "objective": "", "target_skill": "", "teaching_method": "", "success_criteria": "", "frequency": "", "responsible": ""}
        ],
        "section7_accommodations": {
            "classroom": ["list"],
            "learning_modifications": ["list"],
            "communication_supports": ["list"]
        },
        "section8_therapies": {
            "speech_therapy": {"frequency": "", "focus_areas": ""},
            "occupational_therapy": {"frequency": "", "focus_areas": ""},
            "physical_therapy": {"frequency": "", "focus_areas": ""},
            "psychology": {"frequency": "", "focus_areas": ""},
            "sped_sessions": {"frequency": "", "focus_areas": ""},
            "shadow_teacher": {"hours": ""}
        },
        "section9_home_program": {
            "speech_tasks": ["3 activities"],
            "sensory_ot_tasks": ["daily activities"],
            "behavioral_tasks": ["strategies"],
            "academic_tasks": ["reinforcement tasks"]
        }
    }, indent=2))
    lines.append("")
    lines.append("Generate 2-3 short-term objectives per long-term goal (12-18 total STOs).")
    lines.append("Make goals SMART: Specific, Measurable, Achievable, Relevant, Time-bound.")
    lines.append("Return ONLY valid JSON. No markdown, no explanation, just the JSON object.")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Call Gemini
# ---------------------------------------------------------------------------

def _call_gemini(prompt):
    """Call Google Gemini API using the stable generativeai SDK and return parsed JSON."""
    import google.generativeai as genai
    from django.conf import settings

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured in settings.")

    genai.configure(api_key=api_key)
    
    # Using the most stable model naming convention
    model = genai.GenerativeModel(
        model_name='gemini-2.5-flash-lite',
        generation_config={
            "temperature": 0.7,
            "response_mime_type": "application/json",
        }
    )

    response = model.generate_content(prompt)
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

def generate_iep(student, cycle, inputs):
    """
    Generate a full IEP JSON structure from form inputs + Gemini AI.
    Returns a dict matching all 12 sections of the THERUNI IEP template.
    """
    forms = _collect_form_data(inputs)
    pa = forms.get('parent_assessment', {})
    ma = forms.get('multi_assessment', {})
    sa = forms.get('sped_assessment', {})

    # Build and send prompt
    prompt = _build_gemini_prompt(student, pa, ma, sa)
    logger.info("Calling Gemini for IEP generation (student=%s)", student.id)

    try:
        ai_data = _call_gemini(prompt)
    except Exception as e:
        logger.error("Gemini call failed: %s", e)
        raise

    # Build the complete IEP structure
    # Section 1 — Student info (from DB, not AI)
    from .models import StudentAccess
    team_members = []
    accesses = StudentAccess.objects.filter(student=student).select_related('user')
    for access in accesses:
        team_members.append({
            "name": f"{access.user.first_name} {access.user.last_name}".strip() or access.user.username,
            "role": access.user.role,
        })

    iep = {
        "section1_student_info": {
            "student_name": f"{student.first_name} {student.last_name}",
            "date_of_birth": str(student.date_of_birth) if student.date_of_birth else "",
            "gender": _safe(pa, 'gender'),
            "grade_level": student.grade or "",
            "iep_start_date": str(cycle.start_date),
            "iep_end_date": str(cycle.end_date),
            "team_members": team_members,
        },
        # Sections 2-9 from AI
        "section2_background": ai_data.get("section2_background", {}),
        "section3_strengths": ai_data.get("section3_strengths", {}),
        "section4_plop": ai_data.get("section4_plop", {}),
        "section5_ltg": ai_data.get("section5_ltg", []),
        "section6_sto": ai_data.get("section6_sto", []),
        "section7_accommodations": ai_data.get("section7_accommodations", {}),
        "section8_therapies": ai_data.get("section8_therapies", {}),
        "section9_home_program": ai_data.get("section9_home_program", {}),
        # Sections 10-11: placeholders for future progress tracking
        "section10_progress": {
            "gas_scores": [],
            "narrative_summary": "",
            "regression_indicators": "",
            "attendance_summary": "",
        },
        "section11_review": {
            "overall_progress": "",
            "barriers": "",
            "successful_strategies": "",
            "adjustments_needed": "",
            "frequency_changes": "",
            "new_goals": "",
        },
        # Section 12: Signatures (empty by default)
        "section12_signatures": {
            "parent_guardian": "",
            "sped_teacher": "",
            "speech_therapist": "",
            "occupational_therapist": "",
            "physical_therapist": "",
            "psychologist": "",
            "case_manager": "",
            "shadow_teacher": "",
        },
    }

    return iep
