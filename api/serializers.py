from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import (
    User, Student, StudentAccess, ReportCycle, GeneratedDocument,
    ParentAssessment, MultidisciplinaryAssessment, SpedAssessment,
    ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker,
    Invitation
)

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        return token

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    assigned_students_count = serializers.SerializerMethodField()
    assigned_student_names = serializers.SerializerMethodField()

    assigned_students = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'first_name', 'last_name', 'specialty', 'password', 'assigned_students_count', 'assigned_student_names', 'assigned_students']

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

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = super().create(validated_data)
        if password:
            user.set_password(password)
            user.save()
        return user

class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = '__all__'

class StudentAccessSerializer(serializers.ModelSerializer):
    student = StudentSerializer(read_only=True)
    class Meta:
        model = StudentAccess
        fields = ['id', 'user', 'student']

class ReportCycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportCycle
        fields = '__all__'

class ParentAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParentAssessment
        fields = '__all__'
        read_only_fields = ['submitted_by']

class MultidisciplinaryAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MultidisciplinaryAssessment
        fields = '__all__'
        read_only_fields = ['submitted_by']

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
    class Meta:
        model = MultidisciplinaryProgressTracker
        fields = '__all__'
        read_only_fields = ['submitted_by']

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
        fields = ['id', 'email', 'token', 'role', 'is_used', 'created_at']
        read_only_fields = ['id', 'token', 'is_used', 'created_at']

class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(required=True)
    last_name = serializers.CharField(required=True)
