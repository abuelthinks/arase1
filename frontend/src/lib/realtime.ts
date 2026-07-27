export const REALTIME_EVENT_NAME = 'arase:realtime-event';

export interface RealtimeActivityEvent {
  id: number;
  type: string;
  event_type: string;
  visibility: string;
  student_id: number | null;
  student_name: string;
  actor_id: number | null;
  actor_name: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface RealtimeToast {
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
}

export interface RealtimeMessage {
  type: 'activity.event';
  event: RealtimeActivityEvent;
  refresh: string[];
  toast?: RealtimeToast | null;
}

export function dispatchRealtimeMessage(message: RealtimeMessage) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<RealtimeMessage>(REALTIME_EVENT_NAME, { detail: message }));
}

const PUBLIC_ROUTE_PREFIXES = ['/login', '/invite'];

/**
 * Real-time toasts must never surface on public/unauthenticated pages
 * (landing, login, invite acceptance). A stale-but-still-valid session cookie
 * can keep `user` populated on these pages, so gate on the route — not just auth.
 */
export function shouldSuppressToasts(): boolean {
  if (typeof window === 'undefined') return true;
  const path = window.location.pathname;
  if (path === '/') return true;
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
