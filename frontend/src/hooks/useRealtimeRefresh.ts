'use client';

import { useEffect, useMemo, useRef } from 'react';
import { REALTIME_EVENT_NAME, type RealtimeMessage } from '@/lib/realtime';

interface UseRealtimeRefreshOptions {
  targets: string[];
  studentId?: number | string | null;
  disabled?: boolean;
  isEditing?: boolean;
  onRefresh: (message: RealtimeMessage) => void | Promise<void>;
}

export function useRealtimeRefresh({
  targets,
  studentId,
  disabled = false,
  isEditing = false,
  onRefresh,
}: UseRealtimeRefreshOptions) {
  const callbackRef = useRef(onRefresh);
  const targetKey = useMemo(() => targets.join('|'), [targets]);

  useEffect(() => {
    callbackRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (disabled || isEditing || typeof window === 'undefined') return;

    const targetSet = new Set(targetKey.split('|').filter(Boolean));
    const handleEvent = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeMessage>).detail;
      if (!detail?.event || !Array.isArray(detail.refresh)) return;
      if (!detail.refresh.some(target => targetSet.has(target))) return;
      if (studentId && detail.event.student_id && String(detail.event.student_id) !== String(studentId)) return;

      void callbackRef.current(detail);
    };

    window.addEventListener(REALTIME_EVENT_NAME, handleEvent);
    return () => window.removeEventListener(REALTIME_EVENT_NAME, handleEvent);
  }, [disabled, isEditing, studentId, targetKey]);

  return undefined;
}
