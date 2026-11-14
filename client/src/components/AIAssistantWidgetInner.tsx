"use client";

import { useState } from "react";
import { Bot, X, Send, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface AIAssistantWidgetProps {
    variant?: "floating" | "inline";
    className?: string;
}

export default function AIAssistantWidgetInner({ variant = "floating", className = "" }: AIAssistantWidgetProps) {
    const [isOpen, setIsOpen] = useState(false);

    if (variant === "inline") {
        return (
            <Link href="/ai-assistant" className={`block ${className}`}>
                <div className="group relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 shadow-xl shadow-blue-100 hover:shadow-2xl hover:shadow-blue-200 transition-all duration-300 hover:scale-[1.02]">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="absolute top-4 right-4">
                        <Sparkles className="w-6 h-6 text-white/40 group-hover:text-white/60 transition-colors" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm group-hover:bg-white/20 transition-colors">
                                <Bot className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white tracking-tight uppercase">AI Assistant</h3>
                                <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Neural Support</p>
                            </div>
                        </div>

                        <p className="text-white/80 font-medium text-sm leading-relaxed mb-6">
                            Get instant help with ticket validation, PNR checks, boarding workflows and operational decisions powered by advanced AI.
                        </p>

                        <div className="flex items-center gap-2 text-white font-bold text-sm group-hover:gap-3 transition-all">
                            <span className="uppercase tracking-wider">Open Chat</span>
                            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </div>
                </div>
            </Link>
        );
    }

    return (
        <>
            <motion.button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-full shadow-2xl shadow-blue-200 hover:shadow-blue-300 hover:scale-110 transition-all duration-300 ${className}`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
            >
                <AnimatePresence mode="wait">
                    {isOpen ? (
                        <motion.div
                            key="close"
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <X className="w-6 h-6" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="bot"
                            initial={{ rotate: 90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: -90, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="relative"
                        >
                            <Bot className="w-6 h-6" />
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-24 right-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
                    >
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                                    <Bot className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-white font-black text-sm uppercase tracking-tight">AI Assistant</h3>
                                    <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Always Ready</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 space-y-4">
                            <p className="text-slate-600 text-sm font-medium leading-relaxed">
                                Need help? I can assist you with:
                            </p>

                            <div className="space-y-2">
                                {[
                                    "🔍 Verify PNR and passenger details",
                                    "📊 Review train schedules and manifests",
                                    "🚆 Check boarding flow and coach status",
                                    "🛠️ Get operational guidance",
                                    "❓ Ask for ticket validation steps"
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                                        <span>{item}</span>
                                    </div>
                                ))}
                            </div>

                            <Link href="/ai-assistant">
                                <button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4 rounded-xl font-bold text-sm uppercase tracking-wider hover:shadow-lg hover:shadow-blue-200 transition-all duration-300 flex items-center justify-center gap-2 group">
                                    <span>Open Full Chat</span>
                                    <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
