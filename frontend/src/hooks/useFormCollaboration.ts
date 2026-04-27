"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Cookies from "js-cookie";
import { API_BASE_URL } from "@/lib/api";

export interface PresenceLock {
    user_id: number;
    user_name: string;
    specialty?: string;
    section_key: string;
    acquired_at: number;
    expires_at: number;
}

export interface CollabSavedEvent {
    section_key: string;
    by: { user_id: number; user_name: string };
    form_data: Record<string, any> | null;
    ts: string;
}

export interface CollabSubmittedEvent {
    section_key: string;
    by: { user_id: number; user_name: string };
    finalized: boolean;
    ts: string;
}

export interface UseFormCollaborationOptions {
    formType: "assessment" | "tracker";
    instanceId: number | string | null | undefined;
    currentUserId: number | undefined;
    onSectionSaved?: (event: CollabSavedEvent) => void;
    onSectionSubmitted?: (event: CollabSubmittedEvent) => void;
}

interface UseFormCollaborationReturn {
    locks: PresenceLock[];
    connected: boolean;
    acquireLock: (sectionKey: string) => void;
    releaseLock: (sectionKey: string) => void;
    refreshLock: (sectionKey: string) => void;
    isLockedByOther: (sectionKey: string) => PresenceLock | null;
    isLockedByMe: (sectionKey: string) => boolean;
}

const REFRESH_INTERVAL_MS = 20_000;
const RECONNECT_DELAY_MS = 4_000;

function getWsBase(): string {
    if (typeof window === "undefined") return "";
    const httpBase = API_BASE_URL || window.location.origin;
    const wsProtocol = httpBase.startsWith("https") ? "wss" : "ws";
    return `${wsProtocol}://${httpBase.replace(/^https?:\/\//, "")}`;
}

export function useFormCollaboration({
    formType,
    instanceId,
    currentUserId,
    onSectionSaved,
    onSectionSubmitted,
}: UseFormCollaborationOptions): UseFormCollaborationReturn {
    const [locks, setLocks] = useState<PresenceLock[]>([]);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heldSections = useRef<Set<string>>(new Set());
    const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    // Keep latest callbacks without re-triggering connect cycles.
    const savedCb = useRef(onSectionSaved);
    const submittedCb = useRef(onSectionSubmitted);
    useEffect(() => { savedCb.current = onSectionSaved; }, [onSectionSaved]);
    useEffect(() => { submittedCb.current = onSectionSubmitted; }, [onSectionSubmitted]);

    const send = useCallback((payload: Record<string, any>) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        try { ws.send(JSON.stringify(payload)); } catch { /* noop */ }
    }, []);

    const acquireLock = useCallback((sectionKey: string) => {
        heldSections.current.add(sectionKey);
        send({ type: "lock.acquire", section_key: sectionKey });
    }, [send]);

    const releaseLock = useCallback((sectionKey: string) => {
        heldSections.current.delete(sectionKey);
        send({ type: "lock.release", section_key: sectionKey });
    }, [send]);

    const refreshLock = useCallback((sectionKey: string) => {
        if (!heldSections.current.has(sectionKey)) return;
        send({ type: "lock.refresh", section_key: sectionKey });
    }, [send]);

    const isLockedByOther = useCallback((sectionKey: string): PresenceLock | null => {
        const lock = locks.find(l => l.section_key === sectionKey);
        if (!lock) return null;
        if (currentUserId && lock.user_id === currentUserId) return null;
        return lock;
    }, [locks, currentUserId]);

    const isLockedByMe = useCallback((sectionKey: string): boolean => {
        if (!currentUserId) return false;
        return locks.some(l => l.section_key === sectionKey && l.user_id === currentUserId);
    }, [locks, currentUserId]);

    useEffect(() => {
        if (!instanceId) return;
        const id = String(instanceId);
        let cancelled = false;

        const connect = () => {
            if (cancelled) return;
            if (typeof window === "undefined") return;
            const token = Cookies.get("access_token");
            if (!token) {
                reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
                return;
            }
            const url = `${getWsBase()}/ws/collab/${formType}/${id}/?token=${token}`;
            let ws: WebSocket;
            try {
                ws = new WebSocket(url);
            } catch {
                reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
                return;
            }
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                // Re-acquire any locks we held before a reconnect.
                for (const key of heldSections.current) {
                    ws.send(JSON.stringify({ type: "lock.acquire", section_key: key }));
                }
            };

            ws.onmessage = (event) => {
                let msg: any;
                try { msg = JSON.parse(event.data); } catch { return; }
                if (!msg || typeof msg !== "object") return;

                switch (msg.type) {
                    case "presence.snapshot":
                    case "presence.update":
                        setLocks(Array.isArray(msg.locks) ? msg.locks : []);
                        break;
                    case "section.saved":
                        savedCb.current?.(msg as CollabSavedEvent);
                        break;
                    case "section.submitted":
                        submittedCb.current?.(msg as CollabSubmittedEvent);
                        break;
                    case "lock.denied":
                        // If the server denied us, drop the local intent.
                        if (msg.section_key) heldSections.current.delete(msg.section_key);
                        break;
                    default:
                        break;
                }
            };

            ws.onclose = () => {
                setConnected(false);
                wsRef.current = null;
                if (!cancelled) {
                    reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
                }
            };

            ws.onerror = () => {
                try { ws.close(); } catch { /* noop */ }
            };
        };

        connect();

        // Refresh held locks on a timer so they don't expire on the server.
        refreshTimer.current = setInterval(() => {
            for (const key of heldSections.current) {
                send({ type: "lock.refresh", section_key: key });
            }
        }, REFRESH_INTERVAL_MS);

        return () => {
            cancelled = true;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (refreshTimer.current) clearInterval(refreshTimer.current);
            const ws = wsRef.current;
            if (ws) {
                ws.onclose = null;
                try { ws.close(); } catch { /* noop */ }
            }
            wsRef.current = null;
            heldSections.current.clear();
        };
    }, [formType, instanceId, send]);

    return {
        locks,
        connected,
        acquireLock,
        releaseLock,
        refreshLock,
        isLockedByOther,
        isLockedByMe,
    };
}
