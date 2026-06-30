"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { authApi, type UserOut } from "@/lib/api/auth";
import { AUTH_TOKEN_KEY } from "@/lib/api/base";

interface AuthContextValue {
  user: UserOut | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  isCommercial: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function persistToken(token: string) {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  // Mirrored into a cookie (non-HttpOnly) so the Next.js middleware can
  // read it server-side for route protection.
  document.cookie = `${AUTH_TOKEN_KEY}=${token}; path=/; max-age=${60 * 60 * 24 * 30}`;
}

function clearToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  document.cookie = `${AUTH_TOKEN_KEY}=; path=/; max-age=0`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }
    setToken(stored);
    authApi
      .me()
      .then((me) => setUser(me))
      .catch(() => {
        clearToken();
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    persistToken(result.access_token);
    setToken(result.access_token);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    isAdmin: user?.role === "admin",
    isCommercial: user?.role === "commercial",
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return ctx;
}
