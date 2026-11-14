"use client";
import { useTheme } from "@/context/ThemeContext";

export default function UserSettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="max-w-xl mx-auto py-20 px-4">
        <h1 className="text-3xl font-bold mb-8">User Settings</h1>
        <div className="mb-6">
          <label className="block font-semibold mb-2">Theme</label>
          <select
            value={theme}
            onChange={e => setTheme(e.target.value === "dark" ? "dark" : "light")}
            className="p-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          >
            <option value="light">Light (Professional)</option>
            <option value="dark">Dark (Professional)</option>
          </select>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400">Choose your preferred color theme for your user dashboard.</p>
      </div>
    </div>
  );
}
