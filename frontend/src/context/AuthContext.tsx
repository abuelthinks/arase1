"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import api, { fetchCsrfCookie } from "@/lib/api";

type Role = "ADMIN" | "TEACHER" | "SPECIALIST" | "PARENT";

interface UserPayload {
    user_id: number;
    role: Role;
    username?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    is_phone_verified?: boolean;
    specialty?: string;
    specialties?: string[];
    languages?: string[];
    specialist_onboarding_complete?: boolean;
    specialist_onboarding_missing?: string[];
}

interface AuthContextType {
    user: UserPayload | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<UserPayload>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<UserPayload | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<UserPayload | null>(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = async (): Promise<UserPayload | null> => {
        try {
            const response = await api.get("/api/auth/me/");
            setUser(response.data);
            return response.data;
        } catch {
            setUser(null);
            return null;
        } finally {
            setLoading(false);
        }
    };

    // On mount, check auth state by calling /api/auth/me/
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                await fetchCsrfCookie();
            } catch {
                // Ignore bootstrap failures here; auth check below will surface real problems.
            }
            await checkAuth();
        };
        initializeAuth();
    }, []);

    const login = async (username: string, password: string) => {
        await fetchCsrfCookie();
        // POST credentials — server sets HttpOnly cookies in the response
        const res = await api.post("/api/auth/token/", { username, password });
        const basicUser = {
            user_id: res.data.user_id,
            role: res.data.role,
            username: res.data.username,
        };
        setUser(basicUser);
        // We'll also invoke checkAuth to fetch the full rich payload including phone verification
        const fullUser = await checkAuth();
        return fullUser || basicUser;
    };

    const logout = async () => {
        try {
            // Server clears HttpOnly cookies and blacklists the refresh token
            await fetchCsrfCookie();
            await api.post("/api/auth/logout/");
        } catch {
            // Ignore errors — clear state anyway
        }
        setUser(null);
        window.location.href = "/login";
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
