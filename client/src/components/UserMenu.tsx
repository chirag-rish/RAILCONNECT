"use client";

import { useState } from "react";
import { User, Settings, History, Download } from "lucide-react";
import Link from "next/link";

export default function UserMenu({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block text-left z-50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 py-2 rounded-full shadow-lg hover:scale-105 transition-all font-bold bg-blue-600 text-white dark:bg-slate-800 dark:text-white"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <User className="w-5 h-5" />
        Menu
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl shadow-xl ring-1 ring-black/10 focus:outline-none bg-white dark:bg-slate-900">
          <div className="py-2">
            <Link href={isAdmin ? "/admin/bookings" : "/my-bookings"} className="flex items-center gap-3 px-5 py-3 font-semibold transition-all text-blue-700 dark:text-blue-300 dark:hover:bg-slate-800 hover:bg-blue-50">
              <History className="w-4 h-4" /> Booking History
            </Link>
            <Link href={isAdmin ? "/admin/settings" : "/user/settings"} className="flex items-center gap-3 px-5 py-3 font-semibold transition-all text-green-700 dark:text-green-300 dark:hover:bg-slate-800 hover:bg-green-50">
              <Settings className="w-4 h-4" /> Settings
            </Link>
            <Link href={isAdmin ? "/admin/downloads" : "/download-tickets"} className="flex items-center gap-3 px-5 py-3 font-semibold transition-all text-pink-700 dark:text-pink-300 dark:hover:bg-slate-800 hover:bg-pink-50">
              <Download className="w-4 h-4" /> Download Tickets
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
