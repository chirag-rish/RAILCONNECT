"use client";
import { useState } from "react";

export default function SettingsPage() {
  const [theme, setTheme] = useState("light");

  return (
    <div className={theme === "dark" ? "min-h-screen bg-slate-900 text-white" : "min-h-screen bg-blue-50 text-slate-900"}>
      <div className="max-w-xl mx-auto py-20 px-4">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>
        <div className="mb-6">
          <label className="block font-semibold mb-2">Theme</label>
          <select
            value={theme}
            onChange={e => setTheme(e.target.value)}
            className="p-2 rounded border border-slate-300 bg-white text-slate-900"
          >
            <option value="light">Light (Blue)</option>
            <option value="dark">Dark (Slate)</option>
          </select>
        </div>
        <p className="text-slate-500">Choose your preferred color theme for the app.</p>
      </div>
    </div>
  );
}
