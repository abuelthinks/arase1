'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/lib/api';
import { dispatchRealtimeMessage, type RealtimeMessage } from '@/lib/realtime';

const RECONNECT_DELAY_MS = 5000;

function getWsUrl(): string {
  const httpBase = API_BASE_URL || window.location.origin;
  const wsProtocol = httpBase.startsWith('https') ? 'wss' : 'ws';
  const host = httpBase.replace(/^https?:\/\//, '');
  return `${wsProtocol}://${host}/ws/realtime/`;
}

function showRealtimeToast(message: RealtimeMessage) {
  const toastPayload = message.toast;
  if (!toastPayload) return;

  const description = toastPayload.message || undefined;
  if (toastPayload.level === 'success') {
    toast.success(toastPayload.title, { description });
  } else if (toastPayload.level === 'warning') {
    toast.warning(toastPayload.title, { description });
  } else if (toastPayload.level === 'error') {
    toast.error(toastPayload.title, { description });
  } else {
    toast(toastPayload.title, { description });
  }
}

export default function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenEventIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;
    const connect = () => {
      if (cancelled || typeof window === 'undefined') return;

      try {
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        ws.onmessage = (event) => {
          let message: RealtimeMessage;
          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }
          if (message?.type !== 'activity.event' || !message.event?.id) return;
          if (seenEventIds.current.has(message.event.id)) return;

          seenEventIds.current.add(message.event.id);
          if (seenEventIds.current.size > 250) {
            seenEventIds.current = new Set(Array.from(seenEventIds.current).slice(-150));
          }

          dispatchRealtimeMessage(message);
          showRealtimeToast(message);
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (!cancelled) {
            reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
          }
        };

        ws.onerror = () => {
          try { ws.close(); } catch { /* noop */ }
        };
      } catch {
        if (!cancelled) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        try { ws.close(); } catch { /* noop */ }
      }
      wsRef.current = null;
    };
  }, [user]);

  return <>{children}</>;
}
