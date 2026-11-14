
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import { API_URL } from "@/lib/constants";
import { motion } from "framer-motion";
import { Lock, ArrowRight, CheckCircle } from "lucide-react";

export default function ResetPasswordPage() {
    const params = useParams<{ token: string }>();
    const router = useRouter();

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }

        setLoading(true);

        try {
            await axios.put(
                `${API_URL}/auth/resetpassword/${params.token}`,
                { password }
            );

            setSuccess(true);
            toast.success("Password reset successful!");

            setTimeout(() => router.push("/login"), 3000);
        } catch (error: unknown) {
            const message = axios.isAxiosError<{ message?: string }>(error)
                ? error.response?.data?.message
                : undefined;

            toast.error(message || "Failed to reset password");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center"
                >
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                        <CheckCircle size={32} />
                    </div>

                    <h1 className="text-2xl font-bold text-gray-800 mb-2">
                        Password Reset!
                    </h1>

                    <p className="text-gray-600 mb-6">
                        Your password has been successfully updated. Redirecting you to login...
                    </p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full"
            >
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
                        <Lock size={24} />
                    </div>

                    <h1 className="text-2xl font-bold text-gray-800">
                        New Password
                    </h1>
                </div>

                <p className="text-gray-500 mb-8">
                    Please enter your new secure password below.
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label
                            htmlFor="reset-password"
                            className="block text-sm font-medium text-gray-700 mb-2"
                        >
                            New Password{" "}
                            <span aria-hidden="true" className="text-red-500">
                                *
                            </span>
                        </label>

                        <input
                            id="reset-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            aria-required="true"
                            aria-describedby="reset-password-hint"
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-800"
                        />

                        <p
                            id="reset-password-hint"
                            className="text-xs text-gray-500 mt-2"
                        >
                            Must be at least 8 characters and include a mix of letters and numbers.
                        </p>
                    </div>

                    <div>
                        <label
                            htmlFor="reset-confirm-password"
                            className="block text-sm font-medium text-gray-700 mb-2"
                        >
                            Confirm Password{" "}
                            <span aria-hidden="true" className="text-red-500">
                                *
                            </span>
                        </label>

                        <input
                            id="reset-confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            aria-required="true"
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-800"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2 group"
                    >
                        {loading ? "Updating..." : "Reset Password"}

                        {!loading && (
                            <ArrowRight
                                size={18}
                                className="group-hover:translate-x-1 transition-transform"
                            />
                        )}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}
