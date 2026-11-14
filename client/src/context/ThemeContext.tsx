
"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useSyncExternalStore,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const listeners = new Set<() => void>();

const subscribe = (callback: () => void) => {
    listeners.add(callback);

    return () => {
        listeners.delete(callback);
    };
};

const getSnapshot = (): Theme => {
    return localStorage.getItem("theme") === "dark" ? "dark" : "light";
};

const getServerSnapshot = (): Theme => "light";

const updateTheme = (theme: Theme) => {
    localStorage.setItem("theme", theme);
    listeners.forEach((callback) => callback());
};

const ThemeContext = createContext<ThemeContextType>({
    theme: "light",
    setTheme: updateTheme,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const theme = useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
    );

    useEffect(() => {
        document.body.classList.remove("dark", "light");
        document.body.classList.add(theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme: updateTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
