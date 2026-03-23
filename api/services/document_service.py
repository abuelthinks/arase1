import json
from api.models import DocumentVersion

def record_document_version(document, user, action_label):
    """
    Creates an immutable snapshot of a GeneratedDocument.
    action_label should be a string like 'GENERATED', 'EDITED_DRAFT', or 'FINALIZED'.
    """
    # Create a deep copy of the JSON data to ensure immutability
    iep_data_snapshot = json.loads(json.dumps(document.iep_data))
    
    version = DocumentVersion.objects.create(
        document=document,
        action=action_label,
        edited_by=user,
        iep_data=iep_data_snapshot,
        status=document.status
    )
    return version
