import json

def _get_check(val):
    return "[X]" if val else "[ ]"

def _mock_llm_call(prompt: str, is_iep=True) -> str:
    """
    Simulates a call to an LLM like GPT-4o or Gemini.
    In real production, this would use `openai.ChatCompletion.create()`.
    """
    pii_free_prompt = prompt.replace("John Doe", "The Student")
    
    if is_iep:
        return (
            "1. Improve expressive communication skills to include 3-word sentences.\n"
            "2. Enhance fine motor coordination for writing and tracing letters.\n"
            "3. Develop independent coping strategies for emotional regulation."
        )
    else:
        return (
            "- Continue 15-minute daily occupational therapy routines at home.\n"
            "- Emphasize visual schedules to ease transitions.\n"
            "- Review mathematical grouping concepts weekly."
        )

def extract_assessment_draft(student, cycle, inputs):
    # Base assessment logic (simplified for mockup)
    pa = inputs.get('parent_assessment')
    ma = inputs.get('multi_assessment')
    sa = inputs.get('sped_assessment')
    
    sections = []
    
    # Section A: Generative summary of Background
    sections.append({
        "id": "sec_a",
        "title": "Section A: Background Information",
        "type": "fields",
        "fields": [
            {"name": "full_name", "label": "Child's Name", "type": "text", "value": f"{student.first_name} {student.last_name}"},
            {"name": "dob", "label": "Date of Birth", "type": "text", "value": student.date_of_birth},
            {"name": "grade", "label": "Grade/Level", "type": "text", "value": student.grade},
        ]
    })
    
    # Section B: Multidisciplinary notes (mock pass-through)
    ma_data = ma.form_data if ma else {}
    sections.append({
        "id": "sec_b",
        "title": "Section B: Multidisciplinary Summary",
        "type": "fields",
        "fields": [
            {"name": "multi_summary", "label": "Specialist Summary", "type": "textarea", "value": json.dumps(ma_data.get('section_g', {}), indent=2)}
        ]
    })
    
    return {
        "title": "SPECIAL EDUCATION ASSESSMENT DRAFT",
        "header_code": "LD-001",
        "sections": sections
    }

def extract_iep_draft(student, cycle, inputs):
    pa = inputs.get('parent_assessment')
    ma = inputs.get('multi_assessment')
    sa = inputs.get('sped_assessment')
    
    prompt = f"Generate an IEP for a student in grade {student.grade}. "
    prompt += f"Parent Input: {json.dumps(pa.form_data if pa else {})}. "
    prompt += f"Specialist Input: {json.dumps(ma.form_data if ma else {})}. "
    prompt += f"Teacher Input: {json.dumps(sa.form_data if sa else {})}. "
    
    ai_goals = _mock_llm_call(prompt, is_iep=True)
    
    sections = []
    
    sections.append({
        "id": "sec_a",
        "title": "Section A: Child Information",
        "type": "fields",
        "fields": [
            {"name": "full_name", "label": "Child's Name", "type": "text", "value": f"{student.first_name} {student.last_name}"},
            {"name": "start_date", "label": "IEP Start Date", "type": "text", "value": cycle.start_date},
        ]
    })
    
    sections.append({
        "id": "sec_e",
        "title": "Section E: AI-Generated IEP Goals",
        "type": "fields",
        "fields": [
            {"name": "goals", "label": "Goals", "type": "textarea", "value": ai_goals}
        ]
    })
    
    return {
        "title": "Comprehensive AI IEP",
        "header_code": "THERUNI-AI-IEP",
        "sections": sections
    }

def extract_monthly_draft(student, cycle, inputs):
    pt = inputs.get('parent_tracker')
    mt = inputs.get('multi_tracker')
    st = inputs.get('sped_tracker')
    
    prompt = f"Generate monthly home recommendations for a student in grade {student.grade}. "
    prompt += f"Parent Tracker: {json.dumps(pt.form_data if pt else {})}. "
    prompt += f"Specialist Tracker: {json.dumps(mt.form_data if mt else {})}. "
    prompt += f"Teacher Tracker: {json.dumps(st.form_data if st else {})}. "
    
    ai_recommendations = _mock_llm_call(prompt, is_iep=False)
    
    sections = []
    
    sections.append({
        "id": "sec1",
        "title": "Child Information",
        "type": "fields",
        "fields": [
            {"name": "full_name", "label": "Name", "type": "text", "value": f"{student.first_name} {student.last_name}"},
        ]
    })
    
    sections.append({
        "id": "sec_rec",
        "title": "Monthly Recommendations (AI Generated)",
        "type": "fields",
        "fields": [
            {"name": "goals", "label": "Home Program", "type": "textarea", "value": ai_recommendations}
        ]
    })
    
    return {
        "title": "AI Monthly Progress Report",
        "header_code": "THERUNI-MONTHLY",
        "sections": sections
    }
