from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .specialties import validate_specialties
from .models import (
    User, Student, StudentAccess, ReportCycle, GeneratedDocument,
    ParentAssessment, MultidisciplinaryAssessment, SpedAssessment,
    ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker,
    Invitation, Notification, SpecialistPreference, SectionContribution
)

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        identifier = (attrs.get(self.username_field) or "").strip()
        password = attrs.get("password")

        if identifier and password:
            user_model = get_user_model()
            matched_user = user_model.objects.filter(
                Q(username__iexact=identifier) | Q(email__iexact=identifier)
            ).first()
            if matched_user and matched_user.username != identifier:
                attrs[self.username_field] = matched_user.username

        return super().validate(attrs)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        return token

class AdminUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    specialties = serializers.ListField(
        child=serializers.CharField(allow_blank=True),
        required=False,
        allow_empty=True,
    )
    assigned_students_count = serializers.SerializerMethodField()
    assigned_student_names = serializers.SerializerMethodField()

    assigned_students = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'first_name', 'last_name', 'specialty',
                  'specialties',
                  'phone_number', 'is_phone_verified',
                  'password', 'assigned_students_count', 'assigned_student_names', 'assigned_students']

    def get_assigned_students_count(self, obj):
        return obj.student_access.count()

    def get_assigned_student_names(self, obj):
        # Only fetch up to 5 names for preview purposes
        accesses = obj.student_access.all().select_related('student')[:5]
        names = [f"{a.student.first_name} {a.student.last_name}" for a in accesses]
        if obj.student_access.count() > 5:
            names.append("...")
        return names
        
    def get_assigned_students(self, obj):
        # We fetch full assigned students for detailed views
        accesses = obj.student_access.all().select_related('student')
        return [{"id": a.student.id, "first_name": a.student.first_name, "last_name": a.student.last_name, "grade": a.student.grade, "status": a.student.status} for a in accesses]

    def _resolve_specialties(self, role: str, validated_data: dict, instance=None) -> list[str]:
        """Reconcile single `specialty` and list `specialties` inputs.

        Returns the canonical list. Mutates validated_data so both fields are written.
        """
        has_list = 'specialties' in validated_data
        has_single = 'specialty' in validated_data

        if has_list:
            raw_list = validated_data.get('specialties') or []
        elif has_single:
            single = validated_data.get('specialty')
            raw_list = [single] if single else []
        elif instance is not None:
            raw_list = instance.specialty_list()
        else:
            raw_list = []

        try:
            normalized = validate_specialties(role, raw_list)
        except ValueError as exc:
            raise serializers.ValidationError({"specialties": str(exc)})

        validated_data['specialties'] = normalized
        validated_data['specialty'] = normalized[0] if normalized else ''
        return normalized

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        self._resolve_specialties(validated_data.get('role', ''), validated_data)
        # Title-case names
        if 'first_name' in validated_data:
            validated_data['first_name'] = validated_data['first_name'].strip().title()
        if 'last_name' in validated_data:
            validated_data['last_name'] = validated_data['last_name'].strip().title()
        user = super().create(validated_data)
        if password:
            user.set_password(password)
            user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        next_role = validated_data.get('role', instance.role)
        self._resolve_specialties(next_role, validated_data, instance=instance)
        if 'first_name' in validated_data:
            validated_data['first_name'] = validated_data['first_name'].strip().title()
        if 'last_name' in validated_data:
            validated_data['last_name'] = validated_data['last_name'].strip().title()
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=['password'])
        return user


class SelfUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'role', 'first_name', 'last_name',
            'specialty', 'specialties', 'phone_number', 'is_phone_verified'
        ]
        read_only_fields = fields

class StudentSerializer(serializers.ModelSerializer):
    has_parent_assessment = serializers.SerializerMethodField()
    parent_current_tracker_submitted = serializers.SerializerMethodField()
    active_cycle_label = serializers.SerializerMethodField()
    latest_final_monthly_report_id = serializers.SerializerMethodField()
    recent_activity_at = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = '__all__'

    def get_has_parent_assessment(self, obj):
        return ParentAssessment.objects.filter(student=obj).exists()

    def _get_active_cycle(self, obj):
        return (
            ReportCycle.objects
            .filter(student=obj, is_active=True)
            .order_by('-created_at')
            .first()
        )

    def get_parent_current_tracker_submitted(self, obj):
        cycle = self._get_active_cycle(obj)
        if not cycle:
            return False
        return ParentProgressTracker.objects.filter(student=obj, report_cycle=cycle).exists()

    def get_active_cycle_label(self, obj):
        cycle = self._get_active_cycle(obj)
        return cycle.label if cycle else None

    def get_latest_final_monthly_report_id(self, obj):
        report = (
            GeneratedDocument.objects
            .filter(student=obj, document_type='MONTHLY', status='FINAL')
            .order_by('-created_at')
            .first()
        )
        return report.id if report else None

    def get_recent_activity_at(self, obj):
        timestamps = []

        related_models = [
            ParentAssessment,
            MultidisciplinaryAssessment,
            SpedAssessment,
            ParentProgressTracker,
            MultidisciplinaryProgressTracker,
            SpedProgressTracker,
            GeneratedDocument,
            ReportCycle,
        ]

        for model in related_models:
            latest = (
                model.objects
                .filter(student=obj)
                .order_by('-created_at')
                .values_list('created_at', flat=True)
                .first()
            )
            if latest:
                timestamps.append(latest)

        return max(timestamps) if timestamps else None

class StudentAccessSerializer(serializers.ModelSerializer):
    student = StudentSerializer(read_only=True)
    class Meta:
        model = StudentAccess
        fields = ['id', 'user', 'student', 'assigned_specialties']

class ReportCycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportCycle
        fields = '__all__'

class ParentAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParentAssessment
        fields = '__all__'
        read_only_fields = ['submitted_by']

class SectionContributionSerializer(serializers.ModelSerializer):
    specialist_name = serializers.SerializerMethodField()

    class Meta:
        model = SectionContribution
        fields = [
            'id', 'form_type', 'section_key', 'specialist', 'specialist_name',
            'specialty', 'status', 'updated_at', 'submitted_at',
        ]
        read_only_fields = fields

    def get_specialist_name(self, obj):
        if not obj.specialist:
            return ''
        name = f"{obj.specialist.first_name} {obj.specialist.last_name}".strip()
        return name or obj.specialist.username


class MultidisciplinaryAssessmentSerializer(serializers.ModelSerializer):
    section_contributions = SectionContributionSerializer(many=True, read_only=True)

    class Meta:
        model = MultidisciplinaryAssessment
        fields = '__all__'
        read_only_fields = ['submitted_by', 'finalized_at', 'finalized_by', 'section_contributions']

class SpedAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpedAssessment
        fields = '__all__'
        read_only_fields = ['submitted_by']

class ParentProgressTrackerSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParentProgressTracker
        fields = '__all__'
        read_only_fields = ['submitted_by']

class MultidisciplinaryProgressTrackerSerializer(serializers.ModelSerializer):
    section_contributions = SectionContributionSerializer(many=True, read_only=True)

    class Meta:
        model = MultidisciplinaryProgressTracker
        fields = '__all__'
        read_only_fields = ['submitted_by', 'finalized_at', 'finalized_by', 'section_contributions']

class SpedProgressTrackerSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpedProgressTracker
        fields = '__all__'
        read_only_fields = ['submitted_by']

class GeneratedDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = GeneratedDocument
        fields = '__all__'

class InvitationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invitation
        fields = ['id', 'email', 'token', 'role', 'is_used', 'created_at', 'expires_at']
        read_only_fields = ['id', 'token', 'is_used', 'created_at', 'expires_at']

class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    last_name = serializers.CharField(required=False, allow_blank=True, default="")
    phone_number = serializers.RegexField(
        regex=r'^\+?[0-9\s\-\(\)]{7,15}$',
        required=False, 
        allow_blank=True, 
        default="",
        error_messages={'invalid': 'Please enter a valid phone number (7-15 characters).'}
    )


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'notification_type', 'title', 'message', 'link', 'is_read', 'created_at']
        read_only_fields = ['id', 'notification_type', 'title', 'message', 'link', 'created_at']

class SpecialistPreferenceSerializer(serializers.ModelSerializer):
    # Include basic details of the specialist for display purposes
    specialist_name = serializers.SerializerMethodField()
    specialist_first_name = serializers.CharField(source='specialist.first_name', read_only=True)
    specialist_last_name = serializers.CharField(source='specialist.last_name', read_only=True)

    class Meta:
        model = SpecialistPreference
        fields = ['id', 'student', 'specialty', 'specialist', 'specialist_name', 'specialist_first_name', 'specialist_last_name']
        read_only_fields = ['id']

    def get_specialist_name(self, obj):
        return f"{obj.specialist.first_name} {obj.specialist.last_name}".strip() or obj.specialist.username
