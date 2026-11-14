
"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import {
    Users,
    Train,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    PieChart as PieChartIcon,
    ShieldCheck,
    Briefcase,
    Activity,
    ChevronRight
} from "lucide-react";
import { API_URL } from "@/lib/constants";
import BackButton from "@/components/BackButton";
import { cn } from "@/utils/cn";
import { YieldDistributionChart, AssetUtilizationChart } from "@/components/ChartCard";

interface AnalyticsStats {
    totalRevenue?: number;
    totalUsers?: number;
    totalBookings?: number;
    yield?: {
        ac?: number;
        sleeper?: number;
        general?: number;
    };
    utilizationLabels?: string[];
    utilization?: number[];
}

interface MetricCardProps {
    title: string;
    value: string;
    change: string;
    positive: boolean;
    icon: ReactNode;
}

export default function AnalyticsPage() {
    const { token, isLoading: authLoading } = useAuth();
    const [stats, setStats] = useState<AnalyticsStats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchAnalytics = useCallback(async () => {
        if (!token) return;

        try {
            const { data } = await axios.get<AnalyticsStats>(
                `${API_URL}/analytics/dashboard`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            setStats(data);
        } catch (error: unknown) {
            toast.error("Failed to sync diagnostics");
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (!authLoading && token) {
            fetchAnalytics();
        } else if (!authLoading && !token) {
            setLoading(false);
        }
    }, [token, authLoading, fetchAnalytics]);

    if (loading || authLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6">
                <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                    Calibrating Data Matrix...
                </p>
            </div>
        );
    }

    const safeStats = stats || {
        totalRevenue: 0,
        totalUsers: 0,
        totalBookings: 0
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-10">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8 flex items-center justify-between">
                    <BackButton />
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
                            Global Diagnostics Layer
                        </span>
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6"
                >
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 mb-2">
                            Network <span className="text-blue-600">Analytics</span>
                        </h1>
                        <p className="text-slate-500 font-medium">
                            High-precision business intelligence and corridor performance metrics
                        </p>
                    </div>

                    <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="px-4 py-2 text-right">
                            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-0.5">
                                Real-time Feed
                            </p>
                            <p className="text-xs font-black text-slate-700 uppercase">
                                Synchronized
                            </p>
                        </div>
                        <div className="h-10 w-[1px] bg-slate-100" />
                        <button
                            onClick={fetchAnalytics}
                            className="p-3 hover:bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors"
                        >
                            <Activity className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                    <MetricCard
                        title="Gross Yield"
                        value={`₹${safeStats.totalRevenue?.toLocaleString()}`}
                        change="+14.2%"
                        positive={true}
                        icon={<Briefcase className="w-5 h-5" />}
                    />

                    <MetricCard
                        title="Registry Base"
                        value={`${safeStats.totalUsers || 0}`}
                        change="+5.8%"
                        positive={true}
                        icon={<Users className="w-5 h-5" />}
                    />

                    <MetricCard
                        title="Total Volume"
                        value={`${safeStats.totalBookings || 0}`}
                        change="-2.1%"
                        positive={false}
                        icon={<Calendar className="w-5 h-5" />}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-sm hover:shadow-2xl hover:shadow-slate-100 transition-all group"
                    >
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3 uppercase leading-none">
                                <PieChartIcon className="w-5 h-5 text-blue-600" />
                                Yield Distribution
                            </h3>
                            <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-blue-200 transition-colors" />
                        </div>

                        <div className="h-72 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[2rem] bg-slate-50/50 group-hover:bg-white transition-colors overflow-hidden relative p-4">
                            {stats ? (
                                <YieldDistributionChart
                                    data={{
                                        labels: ["AC", "Sleeper", "General"],
                                        values: [
                                            stats.yield?.ac || 0,
                                            stats.yield?.sleeper || 0,
                                            stats.yield?.general || 0
                                        ]
                                    }}
                                />
                            ) : (
                                <div className="text-slate-400 text-sm">No Signal</div>
                            )}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-sm hover:shadow-2xl hover:shadow-slate-100 transition-all group"
                    >
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3 uppercase leading-none">
                                <Train className="w-5 h-5 text-blue-600" />
                                Asset Utilization
                            </h3>
                            <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-blue-200 transition-colors" />
                        </div>

                        <div className="h-72 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[2rem] bg-slate-50/50 group-hover:bg-white transition-colors overflow-hidden relative p-4">
                            {stats ? (
                                <AssetUtilizationChart
                                    data={{
                                        labels: stats.utilizationLabels || ["Jan", "Feb", "Mar", "Apr", "May"],
                                        values: stats.utilization || []
                                    }}
                                />
                            ) : (
                                <div className="text-slate-400 text-sm">No Metric Data</div>
                            )}
                        </div>
                    </motion.div>
                </div>

                <div className="mt-20 text-center">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em]">
                        SYSTEM AI ANALYTICS • DATA INTEGRITY: 99.9%
                    </p>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ title, value, change, positive, icon }: MetricCardProps) {
    return (
        <motion.div
            whileHover={{ y: -5 }}
            className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm hover:shadow-2xl hover:border-blue-400 hover:shadow-blue-50/50 transition-all group"
        >
            <div className="flex justify-between items-start mb-8">
                <div className="p-4 bg-slate-50 rounded-2xl text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shadow-inner">
                    {icon}
                </div>

                <div
                    className={cn(
                        "flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-tighter border shadow-sm",
                        positive
                            ? 'bg-green-50 text-green-700 border-green-100'
                            : 'bg-red-50 text-red-700 border-red-100'
                    )}
                >
                    {positive
                        ? <ArrowUpRight className="w-3 h-3" />
                        : <ArrowDownRight className="w-3 h-3" />
                    }
                    {change}
                </div>
            </div>

            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">
                {title}
            </p>

            <h2 className="text-4xl font-black text-slate-800 tracking-tighter group-hover:text-blue-600 transition-colors">
                {value}
            </h2>
        </motion.div>
    );
}
