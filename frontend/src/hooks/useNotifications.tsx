"use client";

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useRef,
    type ReactNode,
} from 'react';
import api, { API_BASE_URL } from '@/lib/api';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/toast-utils';
import { shouldSuppressToasts } from '@/lib/realtime';
import { useAuth } from '@/context/AuthContext';

export interface Notification {
    id: number;
    notification_type: string;
    title: string;
    message: string;
    link: string;
    actor_name: string;
    is_read: boolean;
    created_at: string;
}

interface NotificationContextValue {
    notifications: Notification[];
    unreadCount: number;
    loading: boolean;
    markAsRead: (id: number) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    deleteNotification: (id: number) => Promise<void>;
    refresh: () => Promise<void>;
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
    return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

function ActorAvatar({ name }: { name: string }) {
    return (
        <span
            aria-hidden
            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[11px] font-bold shrink-0"
        >
            {getInitials(name)}
        </span>
    );
}

function getWsUrl(): string {
    const httpBase = API_BASE_URL || window.location.origin;
    const wsProtocol = httpBase.startsWith('https') ? 'wss' : 'ws';
    const host = httpBase.replace(/^https?:\/\//, '');
    return `${wsProtocol}://${host}/ws/notifications/`;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Owns the single notification WebSocket, polling fallback, toast firing, and
 * shared state. Mounted ONCE at the app root so the toast side-effect fires
 * exactly once per notification — no matter how many <NotificationBell>s are on
 * screen (the responsive layout renders one in the navbar and one in the shell).
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toastedIds = useRef<Set<number>>(new Set());

    const fetchNotifications = useCallback(async () => {
        if (!user) return;
        try {
            const res = await api.get('/api/notifications/');
            setNotifications(res.data.notifications);
            setUnreadCount(res.data.unread_count);
        } catch (error: any) {
            if (error?.response?.status !== 401) {
                console.error("Failed to fetch notifications:", error);
            }
        } finally {
            setLoading(false);
        }
    }, [user]);

    const markAsRead = useCallback(async (id: number) => {
        if (!user) return;
        try {
            await api.post(`/api/notifications/${id}/read/`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            toast.error(extractApiError(err, "Couldn't mark as read."));
        }
    }, [user]);

    const markAllAsRead = useCallback(async () => {
        if (!user) return;
        try {
            await api.post('/api/notifications/read-all/');
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (err) {
            toast.error(extractApiError(err, "Couldn't mark all as read."));
        }
    }, [user]);

    const deleteNotification = useCallback(async (id: number) => {
        if (!user) return;
        try {
            await api.delete(`/api/notifications/${id}/delete/`);
            setNotifications(prev => {
                const removed = prev.find(n => n.id === id);
                if (removed && !removed.is_read) {
                    setUnreadCount(c => Math.max(0, c - 1));
                }
                return prev.filter(n => n.id !== id);
            });
        } catch (err) {
            toast.error(extractApiError(err, "Couldn't delete notification."));
        }
    }, [user]);

    // ─── Single WebSocket for real-time push ─────────────────────────────────
    const connectWs = useCallback(() => {
        if (!user) return;
        if (typeof window === 'undefined') return;
        try {
            const ws = new WebSocket(getWsUrl());

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type !== 'notification' || !data.notification) return;
                    const incoming: Notification = data.notification;

                    // Fire the toast before the state updater (side-effect stays
                    // outside React's render). Deduped by id within this single
                    // provider instance. Kept brief — title only; the full
                    // message stays in the notification center.
                    if (!incoming.is_read && !toastedIds.current.has(incoming.id) && !shouldSuppressToasts()) {
                        toastedIds.current.add(incoming.id);
                        if (toastedIds.current.size > 250) {
                            toastedIds.current = new Set(Array.from(toastedIds.current).slice(-150));
                        }
                        toast(incoming.title || 'New notification', {
                            id: `notif-${incoming.id}`,
                            icon: incoming.actor_name
                                ? <ActorAvatar name={incoming.actor_name} />
                                : undefined,
                            action: incoming.link
                                ? { label: 'View', onClick: () => window.location.assign(incoming.link) }
                                : undefined,
                        });
                    }

                    setNotifications(prev => {
                        if (prev.some(n => n.id === incoming.id)) return prev;
                        if (!incoming.is_read) {
                            setUnreadCount(c => c + 1);
                        }
                        return [incoming, ...prev].slice(0, 50);
                    });
                } catch (e) {
                    console.error('[WS] Failed to parse message:', e);
                }
            };

            ws.onclose = () => {
                reconnectTimeout.current = setTimeout(connectWs, 5000);
            };

            ws.onerror = () => {
                try { ws.close(); } catch { /* noop */ }
            };

            wsRef.current = ws;
        } catch { /* retry handled by onclose */ }
    }, [user]);

    useEffect(() => {
        if (!user) {
            setNotifications([]);
            setUnreadCount(0);
            setLoading(false);
            return;
        }

        fetchNotifications();
        connectWs();

        // Fallback polling (slower, for when WS is unavailable).
        const interval = setInterval(fetchNotifications, 60000);

        return () => {
            clearInterval(interval);
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
            if (wsRef.current) {
                wsRef.current.onclose = null; // prevent reconnect on intentional close
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user, fetchNotifications, connectWs]);

    return (
        <NotificationContext.Provider
            value={{
                notifications,
                unreadCount,
                loading,
                markAsRead,
                markAllAsRead,
                deleteNotification,
                refresh: fetchNotifications,
            }}
        >
            {children}
        </NotificationContext.Provider>
    );
}

const EMPTY_NOTIFICATIONS: NotificationContextValue = {
    notifications: [],
    unreadCount: 0,
    loading: true,
    markAsRead: async () => {},
    markAllAsRead: async () => {},
    deleteNotification: async () => {},
    refresh: async () => {},
};

/** Read shared notification state. Returns safe defaults outside a provider. */
export function useNotifications(): NotificationContextValue {
    return useContext(NotificationContext) ?? EMPTY_NOTIFICATIONS;
}
