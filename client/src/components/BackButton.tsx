"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function BackButton() {
    const router = useRouter();

    return (
        <motion.button
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.back()}
            className="flex items-center gap-3 text-slate-500 hover:text-slate-900 transition-colors mb-8 group"
        >
            <div className="p-2.5 rounded-full bg-white border border-slate-200 shadow-sm group-hover:border-slate-400 group-hover:shadow-md transition-all">
                <ArrowLeft className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Return to Hub</span>
        </motion.button>
    );
}
