"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: ("ADMIN" | "TEACHER" | "SPECIALIST" | "PARENT")[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push("/login");
            } else if (allowedRoles && !allowedRoles.includes(user.role)) {
                router.push("/dashboard"); // Redirect to their main dashboard if unauthorized
            }
        }
    }, [user, loading, router, allowedRoles]);

    if (loading) {
        return (
            <div className="flex-center" style={{ minHeight: "100vh" }}>
                <p style={{ color: "var(--text-secondary)", fontSize: "1.2rem" }}>Loading securely...</p>
            </div>
        );
    }

    if (!user || (allowedRoles && !allowedRoles.includes(user.role))) {
        return null;
    }

    return <>{children}</>;
}
