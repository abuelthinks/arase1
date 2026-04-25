import { useState, useEffect, useCallback, useRef } from 'react';
import api, { API_BASE_URL } from '@/lib/api';
import { toast } from 'sonner';
import Cookies from 'js-cookie';

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

function getWsUrl(): string {
    const httpBase = API_BASE_URL || window.location.origin;
    const wsProtocol = httpBase.startsWith('https') ? 'wss' : 'ws';
    const host = httpBase.replace(/^https?:\/\//, '');
    return `${wsProtocol}://${host}/ws/notifications/`;
}

export function useNotifications() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await api.get('/api/notifications/');
            setNotifications(res.data.notifications);
            setUnreadCount(res.data.unread_count);
        } catch (error) {
            console.error("Failed to fetch notifications:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    const markAsRead = async (id: number) => {
        try {
            await api.post(`/api/notifications/${id}/read/`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            toast.error("Failed to mark notification as read.");
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.post('/api/notifications/read-all/');
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (error) {
            toast.error("Failed to mark all as read.");
        }
    };

    const deleteNotification = async (id: number) => {
        try {
            await api.delete(`/api/notifications/${id}/delete/`);
            setNotifications(prev => {
                const removed = prev.find(n => n.id === id);
                if (removed && !removed.is_read) {
                    setUnreadCount(c => Math.max(0, c - 1));
                }
                return prev.filter(n => n.id !== id);
            });
        } catch (error) {
            toast.error("Failed to delete notification.");
        }
    };

    // ─── WebSocket for real-time push ────────────────────────────────────
    const connectWs = useCallback(() => {
        if (typeof window === 'undefined') return;

        const token = Cookies.get('access_token');
        if (!token) return;

        try {
            const url = `${getWsUrl()}?token=${token}`;
            const ws = new WebSocket(url);

            ws.onopen = () => {
                console.debug('[WS] Notification channel connected');
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'notification' && data.notification) {
                        const incoming: Notification = data.notification;
                        setNotifications(prev => {
                            // Prevent duplicates
                            if (prev.some(n => n.id === incoming.id)) return prev;
                            return [incoming, ...prev].slice(0, 50);
                        });
                        setUnreadCount(c => c + 1);
                    }
                } catch (e) {
                    console.error('[WS] Failed to parse message:', e);
                }
            };

            ws.onclose = () => {
                console.debug('[WS] Notification channel closed, reconnecting in 5s...');
                reconnectTimeout.current = setTimeout(connectWs, 5000);
            };

            ws.onerror = (err) => {
                console.debug('[WS] Notification channel error:', err);
                ws.close();
            };

            wsRef.current = ws;
        } catch (e) {
            console.debug('[WS] Failed to create WebSocket:', e);
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        connectWs();

        // Fallback polling (slower, for when WS is unavailable)
        const interval = setInterval(fetchNotifications, 60000);

        return () => {
            clearInterval(interval);
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
            if (wsRef.current) {
                wsRef.current.onclose = null; // prevent reconnect on intentional close
                wsRef.current.close();
            }
        };
    }, [fetchNotifications, connectWs]);

    return {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        refresh: fetchNotifications,
    };
}
