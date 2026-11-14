
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import axios from "axios";
import { API_URL } from "@/lib/constants";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";

interface User {
    _id: string;
    name: string;
    email: string;
    role: string;
    token: string | null;
    mobile?: string;
}

interface LoginInput {
    email: string;
    password: string;
}

interface RegisterInput {
    name: string;
    email: string;
    password: string;
    mobile: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (userData: LoginInput) => Promise<void>;
    register: (userData: RegisterInput) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
}

type RecordData = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordData => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
};

const getString = (value: unknown, fallback = ""): string => {
    return typeof value === "string" ? value : fallback;
};

const normalizeAuthUser = (value: unknown): User | null => {
    if (!isRecord(value)) return null;

    const nestedUser = isRecord(value.user) ? value.user : value;
    const token = getString(value.token) || getString(nestedUser.token) || null;

    return {
        _id: getString(nestedUser._id) || getString(nestedUser.id) || getString(value._id) || getString(value.id),
        name: getString(nestedUser.name) || getString(value.name, "User"),
        email: getString(nestedUser.email) || getString(value.email),
        role: getString(nestedUser.role) || getString(value.role, "passenger"),
        token,
        mobile: getString(nestedUser.mobile) || getString(value.mobile) || undefined,
    };
};

const setupAxiosInterceptor = (token: string | null) => {
    if (token) {
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
        delete axios.defaults.headers.common["Authorization"];
    }
};

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (axios.isAxiosError(error)) {
        const responseData: unknown = error.response?.data;

        if (isRecord(responseData) && typeof responseData.message === "string") {
            return responseData.message;
        }

        return error.message || fallback;
    }

    return error instanceof Error ? error.message : fallback;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const storedUser = localStorage.getItem("user");

        if (storedUser) {
            try {
                const parsedUser: unknown = JSON.parse(storedUser);
                const normalizedUser = normalizeAuthUser(parsedUser);

                if (normalizedUser) {
                    setUser(normalizedUser);
                    setupAxiosInterceptor(normalizedUser.token);
                }
            } catch (error) {
                console.error("Failed to parse stored user:", error);
                localStorage.removeItem("user");
            }
        }

        setIsLoading(false);

        const interceptorId = axios.interceptors.response.use(
            (response) => response,
            (error: unknown) => {
                if (axios.isAxiosError(error) && error.response?.status === 401) {
                    if (localStorage.getItem("user")) {
                        setUser(null);
                        localStorage.removeItem("user");
                        setupAxiosInterceptor(null);
                        window.location.href = "/login";
                        toast.error("Session expired. Please login again.");
                    }
                }

                return Promise.reject(error);
            }
        );

        return () => {
            axios.interceptors.response.eject(interceptorId);
        };
    }, []);

    const login = async (userData: LoginInput) => {
        try {
            if (!userData.email || !userData.password) {
                toast.error("Please provide email and password");
                throw new Error("Missing credentials");
            }

            const { data } = await axios.post<unknown>(
                `${API_URL}/auth/login`,
                userData
            );

            const normalizedUser = normalizeAuthUser(data);

            if (!normalizedUser) {
                throw new Error("Invalid login response from server");
            }

            setUser(normalizedUser);
            localStorage.setItem("user", JSON.stringify(normalizedUser));
            setupAxiosInterceptor(normalizedUser.token);
            toast.success("Login Successful");

            if (normalizedUser.role === "admin") {
                router.push("/admin");
            } else if (normalizedUser.role === "tte") {
                router.push("/tte");
            } else {
                router.push("/home");
            }
        } catch (error: unknown) {
            const errorMsg = getErrorMessage(error, "Login failed");
            toast.error(errorMsg);
            throw error;
        }
    };

    const register = async (userData: RegisterInput) => {
        try {
            if (!userData.name || !userData.email || !userData.password || !userData.mobile) {
                toast.error("Please provide all required fields");
                throw new Error("Missing required fields");
            }

            if (userData.password.length < 6) {
                toast.error("Password must be at least 6 characters");
                throw new Error("Password too short");
            }

            const { data } = await axios.post<unknown>(
                `${API_URL}/auth/register`,
                userData
            );

            const normalizedUser = normalizeAuthUser(data);

            if (!normalizedUser) {
                throw new Error("Invalid registration response from server");
            }

            setUser(normalizedUser);
            localStorage.setItem("user", JSON.stringify(normalizedUser));
            setupAxiosInterceptor(normalizedUser.token);
            toast.success("Registration Successful");
            router.push("/home");
        } catch (error: unknown) {
            const errorMsg = getErrorMessage(error, "Registration failed");
            toast.error(errorMsg);
            throw error;
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem("user");
        setupAxiosInterceptor(null);
        router.push("/login");
        toast.success("Logged out");
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token: user?.token || null,
                login,
                register,
                logout,
                isLoading,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }

    return context;
};
