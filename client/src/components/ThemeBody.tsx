"use client";
import { useTheme } from "@/context/ThemeContext";

export default function ThemeBody({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <body className={
      `${theme === "dark" ? "bg-slate-900 text-white" : "bg-blue-50 text-slate-900"}`
    }>
      {children}
    </body>
  );
}
