"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import api from "@/lib/api";

type Role = "ADMIN" | "TEACHER" | "SPECIALIST" | "PARENT";

interface UserPayload {
    user_id: number;
    role: Role;
    username?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
}

interface AuthContextType {
    user: UserPayload | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<UserPayload | null>(null);
    const [loading, setLoading] = useState(true);

    // On mount, check auth state by calling /api/auth/me/
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const response = await api.get("/api/auth/me/");
                setUser(response.data);
            } catch {
                // Not authenticated — that's fine
                setUser(null);
            } finally {
                setLoading(false);
            }
        };
        checkAuth();
    }, []);

    const login = async (username: string, password: string) => {
        // POST credentials — server sets HttpOnly cookies in the response
        const response = await api.post("/api/auth/token/", { username, password });
        setUser({
            user_id: response.data.user_id,
            role: response.data.role,
            username: response.data.username,
        });
    };

    const logout = async () => {
        try {
            // Server clears HttpOnly cookies and blacklists the refresh token
            await api.post("/api/auth/logout/");
        } catch {
            // Ignore errors — clear state anyway
        }
        setUser(null);
        window.location.href = "/login";
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
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
