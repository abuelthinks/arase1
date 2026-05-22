import json
from datetime import timedelta
from django.utils import timezone
from api.models import DocumentVersion

def record_document_version(document, user, action_label):
    """
    Creates an immutable snapshot of a GeneratedDocument.
    action_label should be a string like 'GENERATED', 'EDITED_DRAFT', or 'FINALIZED'.
    If action_label is 'EDITED_DRAFT', we debounce/deduplicate versions created by the
    same user within a 5-minute window to prevent auto-save clutter.
    """
    # Create a deep copy of the JSON data to ensure immutability
    iep_data_snapshot = json.loads(json.dumps(document.iep_data))
    
    if action_label == 'EDITED_DRAFT':
        # Find the most recent version for this document
        recent_version = document.versions.order_by('-created_at').first()
        if recent_version and recent_version.action == 'EDITED_DRAFT' and recent_version.edited_by == user:
            # Check if it was created within the last 5 minutes
            five_minutes_ago = timezone.now() - timedelta(minutes=5)
            if recent_version.created_at >= five_minutes_ago:
                # Update the existing version's data and timestamp instead of creating a new row
                recent_version.iep_data = iep_data_snapshot
                recent_version.status = document.status
                recent_version.created_at = timezone.now()
                recent_version.save()
                return recent_version

    # Otherwise, create a new history entry
    version = DocumentVersion.objects.create(
        document=document,
        action=action_label,
        edited_by=user,
        iep_data=iep_data_snapshot,
        status=document.status
    )
    return version

