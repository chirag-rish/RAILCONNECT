
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { Mail, ArrowRight, ArrowLeft, Send } from "lucide-react";
import BackButton from "@/components/BackButton";
import { API_URL } from "@/lib/constants";

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loggedToFile, setLoggedToFile] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email) {
            toast.error("Please enter your email");
            return;
        }

        setLoading(true);
        setPreviewUrl(null);
        setLoggedToFile(false);

        try {
            const response = await axios.post(`${API_URL}/auth/forgotpassword`, { email });
            setSent(true);
            setPreviewUrl(response.data.previewUrl || null);
            setLoggedToFile(Boolean(response.data.loggedToFile));
            toast.success("Reset link sent!");
        } catch (error: unknown) {
            console.error("Submission Error:", error);

            const errMsg = axios.isAxiosError<{ message?: string }>(error)
                ? error.response?.data?.message || error.message
                : error instanceof Error
                    ? error.message
                    : "Failed to send reset link";

            toast.error(`Error: ${errMsg} (Check server console)`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full"
            >
                <BackButton />

                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
                        <Mail size={24} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">Forgot Password?</h1>
                </div>

                {sent ? (
                    <div className="text-center py-6">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                            <Send size={32} />
                        </div>

                        <p className="text-gray-600 mb-4">
                            We&apos;ve sent a password reset link to <br />
                            <span className="font-bold text-gray-900">{email}</span>
                        </p>

                        {previewUrl && (
                            <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-left mb-4">
                                <p className="font-semibold text-slate-900 mb-2">Reset link preview:</p>
                                <a
                                    href={previewUrl}
                                    className="text-blue-600 break-all hover:underline"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {previewUrl}
                                </a>
                            </div>
                        )}

                        {loggedToFile && !previewUrl && (
                            <p className="text-sm text-orange-600 mb-4">
                                The reset link was logged to the server file for debugging.
                            </p>
                        )}

                        <button
                            onClick={() => router.push("/login")}
                            className="text-blue-600 font-semibold hover:underline flex items-center gap-2 mx-auto"
                        >
                            <ArrowLeft size={16} /> Back to Login
                        </button>
                    </div>
                ) : (
                    <>
                        <p className="text-gray-500 mb-8">
                            Enter your email address and we&apos;ll send you a link to reset your password.
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label
                                    htmlFor="forgot-email"
                                    className="block text-sm font-medium text-gray-700 mb-2"
                                >
                                    Email Address <span aria-hidden="true" className="text-red-500">*</span>
                                </label>

                                <div className="relative">
                                    <input
                                        id="forgot-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="name@gmail.com"
                                        required
                                        aria-required="true"
                                        aria-describedby="forgot-email-hint"
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 transition-all"
                                    />

                                    <Mail
                                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                                        size={18}
                                        aria-hidden="true"
                                    />
                                </div>

                                <p id="forgot-email-hint" className="text-xs text-gray-500 mt-2">
                                    We&apos;ll send a reset link if the email matches an account.
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 group shadow-lg shadow-blue-200"
                            >
                                {loading ? "Sending..." : "Send Reset Link"}
                                {!loading && (
                                    <ArrowRight
                                        size={18}
                                        className="group-hover:translate-x-1 transition-transform"
                                    />
                                )}
                            </button>

                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => router.push("/login")}
                                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Remembered? <span className="text-blue-600 font-semibold">Sign In</span>
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </motion.div>
        </div>
    );
}
