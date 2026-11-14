
"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/utils/cn";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import {
    Users,
    Trash2,
    Search,
    ShieldCheck,
    User,
    AtSign,
    Calendar,
    ChevronRight
} from "lucide-react";
import { API_URL } from "@/lib/constants";
import BackButton from "@/components/BackButton";

interface UserData {
    _id: string;
    name: string;
    email: string;
    role: string;
    mobile?: string;
    createdAt: string;
}

export default function UserManagement() {
    const { token } = useAuth();
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    const fetchUsers = useCallback(async () => {
        try {
            const { data } = await axios.get<UserData[]>(
                `${API_URL}/admin/users`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            setUsers(data);
        } catch (error: unknown) {
            toast.error("Failed to sync registry");
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) {
            fetchUsers();
        } else {
            setLoading(false);
        }
    }, [token, fetchUsers]);

    const handleDeleteUser = async (id: string) => {
        if (!confirm("Confirm permanent removal of entity from national registry?")) return;

        try {
            await axios.delete(`${API_URL}/admin/users/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            toast.success("Entity purged from registry");
            setUsers((previousUsers) =>
                previousUsers.filter((user) => user._id !== id)
            );
        } catch (error: unknown) {
            const message = axios.isAxiosError<{ message?: string }>(error)
                ? error.response?.data?.message
                : undefined;

            toast.error(message || "Purge operation failed");
        }
    };

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6">
                <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                    Accessing Core Registry...
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-10">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8 flex items-center justify-between">
                    <BackButton />
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
                            Admin Control Layer
                        </span>
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-8"
                >
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 mb-2">
                            User <span className="text-blue-600">Registry</span>
                        </h1>
                        <p className="text-slate-500 font-medium">
                            Global entity management and access control protocols
                        </p>
                    </div>

                    <div className="relative group min-w-[320px]">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-hover:text-blue-600 transition-colors" />
                        <input
                            type="text"
                            placeholder="SEARCH ENTITY BY NAME OR EMAIL..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-14 pr-6 text-sm font-black text-slate-800 focus:border-blue-600 outline-none transition-all shadow-sm placeholder:text-slate-400"
                        />
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-white border-b border-slate-100">
                                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                        Authorized Entity
                                    </th>
                                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                        Access Level
                                    </th>
                                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                        Registry Date
                                    </th>
                                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">
                                        Operations
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-50">
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-20 text-center">
                                            <Users className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                                                No matching entities found
                                            </p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map((user) => (
                                        <tr
                                            key={user._id}
                                            className="hover:bg-slate-50/50 transition-colors group"
                                        >
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-5">
                                                    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 font-black group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shadow-inner">
                                                        {user.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                                                            {user.name}
                                                        </div>
                                                        <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mt-1 lowercase">
                                                            <AtSign className="w-3 h-3" />
                                                            {user.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-8 py-6">
                                                <div
                                                    className={cn(
                                                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm",
                                                        user.role === "admin"
                                                            ? "bg-slate-900 text-white border-slate-900"
                                                            : user.role === "staff" || user.role === "tte"
                                                                ? "bg-blue-50 text-blue-700 border-blue-100"
                                                                : "bg-white text-slate-500 border-slate-200"
                                                    )}
                                                >
                                                    {user.role === "admin" ? (
                                                        <ShieldCheck className="w-3 h-3" />
                                                    ) : (
                                                        <User className="w-3 h-3" />
                                                    )}
                                                    {user.role}
                                                </div>
                                            </td>

                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <Calendar className="w-3.5 h-3.5 text-slate-300" />
                                                    <span className="text-xs font-bold font-mono">
                                                        {new Date(user.createdAt).toLocaleDateString(undefined, {
                                                            year: "numeric",
                                                            month: "short",
                                                            day: "numeric"
                                                        })}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="px-8 py-6 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleDeleteUser(user._id)}
                                                        className="p-3 bg-white border border-slate-100 text-slate-300 hover:border-red-500 hover:text-red-600 rounded-xl transition-all shadow-sm active:scale-95"
                                                        title="Purge Record"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                    <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-blue-200 transition-colors" />
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>

                <div className="mt-12 text-center">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em]">
                        SYSTEM ACCESS LOG • TOTAL ENTITIES: {users.length}
                    </p>
                </div>
            </div>
        </div>
    );
}
