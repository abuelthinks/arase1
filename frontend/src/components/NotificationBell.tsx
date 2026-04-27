"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck, ClipboardList, FileText, UserPlus, Calendar, X, AlertCircle, Sparkles } from "lucide-react";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import Link from "next/link";

function timeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    return `${years}y ago`;
}

/* ─── Type-based styling ──────────────────────────────────────────────────── */

interface TypeStyle {
    icon: React.ReactNode;
    bg: string;
    color: string;
}

function getTypeStyle(type: string): TypeStyle {
    switch (type) {
        case 'FORM_SUBMITTED':
            return {
                icon: <ClipboardList size={14} />,
                bg: 'bg-indigo-100',
                color: 'text-indigo-600',
            };
        case 'REPORT_GENERATED':
        case 'REPORT_FINALIZED':
        case 'IEP_GENERATED':
            return {
                icon: <FileText size={14} />,
                bg: 'bg-emerald-100',
                color: 'text-emerald-600',
            };
        case 'STUDENT_ENROLLED':
        case 'SPECIALIST_ASSIGNED':
        case 'TEACHER_ASSIGNED':
            return {
                icon: <UserPlus size={14} />,
                bg: 'bg-blue-100',
                color: 'text-blue-600',
            };
        case 'REMINDER':
            return {
                icon: <Calendar size={14} />,
                bg: 'bg-amber-100',
                color: 'text-amber-600',
            };
        case 'BIRTHDAY':
            return {
                icon: <Sparkles size={14} />,
                bg: 'bg-pink-100',
                color: 'text-pink-600',
            };
        default:
            return {
                icon: <AlertCircle size={14} />,
                bg: 'bg-slate-100',
                color: 'text-slate-500',
            };
    }
}

export default function NotificationBell() {
    const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleNotificationClick = (notif: Notification) => {
        if (!notif.is_read) {
            markAsRead(notif.id);
        }
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-1.5 text-slate-500 hover:bg-slate-100 rounded-full transition-colors flex items-center justify-center cursor-pointer border-none bg-transparent"
                aria-label="Notifications"
            >
                <Bell size={18} strokeWidth={1.6} />
                {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow ring-2 ring-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50 flex flex-col max-h-[85vh]">
                    <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                        <h3 className="font-bold text-slate-800 m-0">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors border-none bg-transparent cursor-pointer p-0"
                            >
                                <CheckCheck size={14} />
                                Mark all read
                            </button>
                        )}
                    </div>
                    
                    <div className="overflow-y-auto flex-1 min-h-[100px]">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 text-sm">
                                <Bell className="mx-auto mb-2 opacity-20" size={32} />
                                No notifications yet
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {notifications.map((notif) => {
                                    const style = getTypeStyle(notif.notification_type);
                                    const isExpanded = expandedIds.has(notif.id);
                                    
                                    const handleToggleExpand = (e: React.MouseEvent) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const next = new Set(expandedIds);
                                        if (next.has(notif.id)) {
                                            next.delete(notif.id);
                                        } else {
                                            next.add(notif.id);
                                        }
                                        setExpandedIds(next);
                                    };

                                    return (
                                        <div
                                            key={notif.id}
                                            className={`p-3 transition-colors relative group ${notif.is_read ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/40 hover:bg-blue-50/60'}`}
                                        >
                                            {!notif.is_read && (
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r shadow-sm" />
                                            )}
                                            <div className="flex gap-2.5">
                                                {/* Type icon */}
                                                <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${style.bg} ${style.color}`}>
                                                    {style.icon}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    {notif.link ? (
                                                        <Link 
                                                            href={notif.link}
                                                            onClick={() => handleNotificationClick(notif)}
                                                            className="block text-slate-800 hover:text-blue-600 focus:outline-none"
                                                        >
                                                            <p className={`text-sm m-0 leading-snug ${!notif.is_read ? 'font-semibold' : 'font-medium'}`}>
                                                                {notif.title}
                                                            </p>
                                                        </Link>
                                                    ) : (
                                                        <div 
                                                            onClick={() => handleNotificationClick(notif)}
                                                            className="block cursor-pointer outline-none"
                                                        >
                                                            <p className={`text-sm m-0 leading-snug ${!notif.is_read ? 'font-semibold' : 'font-medium text-slate-800'}`}>
                                                                {notif.title}
                                                            </p>
                                                        </div>
                                                    )}
                                                    
                                                    {notif.message && (
                                                        <div 
                                                            className="mt-1 cursor-pointer"
                                                            onClick={handleToggleExpand}
                                                            title={isExpanded ? "Click to collapse" : "Click to expand"}
                                                        >
                                                            <p className={`text-xs text-slate-500 m-0 whitespace-pre-wrap ${!isExpanded ? 'line-clamp-2' : ''}`}>
                                                                {notif.message}
                                                            </p>
                                                            {notif.message.length > 60 && (
                                                                <span className="text-[10px] text-blue-500 font-medium inline-block mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    {isExpanded ? 'Show less' : 'Show more'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        {notif.actor_name && (
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                by {notif.actor_name}
                                                            </span>
                                                        )}
                                                        {notif.actor_name && <span className="text-[10px] text-slate-300">·</span>}
                                                        <span className="text-[10px] text-slate-400 font-medium">
                                                            {timeAgo(notif.created_at)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="shrink-0 flex flex-col gap-1 items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {!notif.is_read && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                markAsRead(notif.id);
                                                            }}
                                                            className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-100 transition-colors border-none bg-transparent cursor-pointer p-0 focus:outline-none"
                                                            title="Mark as read"
                                                        >
                                                            <Check size={13} strokeWidth={2.5} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            deleteNotification(notif.id);
                                                        }}
                                                        className="w-6 h-6 rounded-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors border-none bg-transparent cursor-pointer p-0 focus:outline-none"
                                                        title="Delete"
                                                    >
                                                        <X size={13} strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
