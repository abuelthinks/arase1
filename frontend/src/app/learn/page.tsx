'use client';

import './learn.css';
import ProtectedRoute from '@/components/ProtectedRoute';
import LearnExperience from './LearnExperience';

export default function LearnPage() {
  return (
    <ProtectedRoute allowedRoles={['ADMIN']}>
      <div className="px-4 py-6 md:px-8 md:py-10">
        <LearnExperience />
      </div>
    </ProtectedRoute>
  );
}
