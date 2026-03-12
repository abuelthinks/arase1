"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import Cookies from "js-cookie";
import { parseJwt } from "@/lib/api";

type Role = "ADMIN" | "TEACHER" | "SPECIALIST" | "PARENT";

interface UserPayload {
    user_id: number;
    role: Role;
    username?: string;
}

interface AuthContextType {
    user: UserPayload | null;
    loading: boolean;
    login: (access: string, refresh: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<UserPayload | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = Cookies.get("access_token");
        if (token) {
            const decoded = parseJwt(token);
            if (decoded && decoded.exp && decoded.exp * 1000 > Date.now()) {
                setUser({ user_id: decoded.user_id, role: decoded.role });
            } else {
                Cookies.remove("access_token");
            }
        }
        setLoading(false);
    }, []);

    const login = (access: string, refresh: string) => {
        Cookies.set("access_token", access, { secure: true, sameSite: "strict" });
        Cookies.set("refresh_token", refresh, { secure: true, sameSite: "strict" });
        const decoded = parseJwt(access);
        if (decoded) {
            setUser({ user_id: decoded.user_id, role: decoded.role });
        }
    };

    const logout = () => {
        Cookies.remove("access_token");
        Cookies.remove("refresh_token");
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
