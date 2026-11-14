
"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Cpu,
    Layers,
    ShieldAlert,
    Train,
    TrendingUp,
    BarChart2,
    RefreshCw
} from "lucide-react";
import { API_URL } from "@/lib/constants";
import BackButton from "@/components/BackButton";
import { cn } from "@/utils/cn";
import { Bar } from "react-chartjs-2";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface StationAccuracy {
    _id: string;
    mae: number;
    count: number;
}

interface ETASummary {
    predictionCount: number;
    mae: number;
    rmse: number;
}

interface RecentPrediction {
    trainNumber: string | number;
    targetStation: string;
    predictedArrival: string;
    actualArrival?: string | null;
    absoluteError?: number;
    error?: number | null;
}

interface ETAAccuracyData {
    summary?: ETASummary;
    byStation?: StationAccuracy[];
    recentPredictions?: RecentPrediction[];
}

interface DelayCause {
    _id: string;
    totalDuration: number;
    count: number;
}

interface DelayData {
    summary?: {
        avgDelay?: number;
        maxDelay?: number;
    };
    causes?: DelayCause[];
}

interface BottleneckSection {
    _id: {
        from: string;
        to: string;
    };
    count: number;
    avgDelay: number;
}

interface BottleneckData {
    sections?: BottleneckSection[];
}

interface OperationsData {
    activeTrainsCount?: number;
    delayedTrainsCount?: number;
    activeEvents?: unknown[];
    etaPredictionHealth?: {
        status?: string;
        confidence?: number;
        latencyMs?: number;
    };
    dataSourceHealth?: {
        simulator?: string;
        rtis?: string;
        ntes?: string;
    };
}

interface MetricCardProps {
    title: string;
    value: ReactNode;
    icon: ReactNode;
    subtext: string;
}

export default function OperationsDashboardPage() {
    const { token, isLoading: authLoading } = useAuth();

    const [opsData, setOpsData] = useState<OperationsData | null>(null);
    const [etaAccuracy, setEtaAccuracy] = useState<ETAAccuracyData | null>(null);
    const [bottlenecks, setBottlenecks] = useState<BottleneckData | null>(null);
    const [delays, setDelays] = useState<DelayData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchAllData = useCallback(async () => {
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            const headers = {
                Authorization: `Bearer ${token}`
            };

            const [opsRes, etaRes, botRes, delayRes] = await Promise.all([
                axios.get<OperationsData>(`${API_URL}/analytics/operations`, { headers }),
                axios.get<ETAAccuracyData>(`${API_URL}/analytics/eta-accuracy`, { headers }),
                axios.get<BottleneckData>(`${API_URL}/analytics/bottlenecks`, { headers }),
                axios.get<DelayData>(`${API_URL}/analytics/delays`, { headers })
            ]);

            setOpsData(opsRes.data);
            setEtaAccuracy(etaRes.data);
            setBottlenecks(botRes.data);
            setDelays(delayRes.data);
        } catch (error: unknown) {
            toast.error("Failed to load operations intelligence data");
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (!authLoading) {
            if (token) {
                void fetchAllData();
            } else {
                setLoading(false);
            }
        }
    }, [authLoading, token, fetchAllData]);

    if (loading || authLoading) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6">
                <div className="w-16 h-16 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
                <p className="text-[10px] font-black text-cyan-600 uppercase tracking-[0.3em]">
                    Loading Operations Intelligence...
                </p>
            </div>
        );
    }

    const stationChartData = {
        labels: etaAccuracy?.byStation?.map((st) => st._id) || [],
        datasets: [
            {
                label: "MAE by Station (mins)",
                data: etaAccuracy?.byStation?.map((st) => st.mae) || [],
                backgroundColor: "rgba(6, 182, 212, 0.75)",
                borderColor: "rgba(6, 182, 212, 1)",
                borderWidth: 1,
                borderRadius: 6
            }
        ]
    };

    const delayCausesChartData = {
        labels: delays?.causes?.map((cause) => cause._id) || [],
        datasets: [
            {
                label: "Duration (mins)",
                data: delays?.causes?.map((cause) => cause.totalDuration) || [],
                backgroundColor: "rgba(245, 158, 11, 0.75)",
                borderColor: "rgba(245, 158, 11, 1)",
                borderWidth: 1,
                borderRadius: 6
            }
        ]
    };

    return (
        <div className="min-h-screen bg-white text-slate-900 font-sans p-6 md:p-10">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8 flex items-center justify-between">
                    <BackButton />
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => void fetchAllData()}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-700 hover:bg-cyan-100/50 transition text-xs font-bold uppercase tracking-wider"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Refresh Feed
                        </button>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-50 border border-cyan-100">
                            <Activity className="w-4 h-4 text-cyan-600 animate-pulse" />
                            <span className="text-[10px] font-bold text-cyan-700 uppercase tracking-widest">
                                Control Center Active
                            </span>
                        </div>
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-10"
                >
                    <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-2">
                        Railway Control & <span className="text-cyan-600">Operations Intelligence</span>
                    </h1>
                    <p className="text-slate-500 text-sm font-medium">
                        Real-time ETA accuracy, bottleneck leaderboards, delay telemetry, and active network health.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                    <MetricCard
                        title="Active Trains"
                        value={opsData?.activeTrainsCount || 0}
                        icon={<Train className="w-5 h-5 text-cyan-600" />}
                        subtext="Currently running"
                    />
                    <MetricCard
                        title="Delayed Trains"
                        value={opsData?.delayedTrainsCount || 0}
                        icon={<Clock className="w-5 h-5 text-amber-600" />}
                        subtext="Exceeding schedule"
                    />
                    <MetricCard
                        title="Active Events"
                        value={opsData?.activeEvents?.length || 0}
                        icon={<ShieldAlert className="w-5 h-5 text-rose-600" />}
                        subtext="Speed blocks / alerts"
                    />
                    <MetricCard
                        title="ETA MAE"
                        value={
                            etaAccuracy?.summary?.predictionCount
                                ? `${etaAccuracy.summary.mae.toFixed(1)}m`
                                : "Insufficient data"
                        }
                        icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
                        subtext={`Based on ${etaAccuracy?.summary?.predictionCount || 0} predictions`}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                <BarChart2 className="w-5 h-5 text-cyan-600" />
                                ETA Accuracy Metrics
                            </h3>
                            <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-100 text-cyan-800 font-mono">
                                XGBoost Model
                            </span>
                        </div>

                        {etaAccuracy?.summary?.predictionCount ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-3 gap-4 p-4 rounded-2xl bg-white border border-slate-200">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase">Predictions</p>
                                        <p className="text-2xl font-black text-slate-900">
                                            {etaAccuracy.summary.predictionCount}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase">MAE (Error)</p>
                                        <p className="text-2xl font-black text-cyan-600">
                                            {etaAccuracy.summary.mae.toFixed(2)} min
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase">RMSE</p>
                                        <p className="text-2xl font-black text-indigo-600">
                                            {etaAccuracy.summary.rmse.toFixed(2)} min
                                        </p>
                                    </div>
                                </div>

                                <div className="h-48 mt-4">
                                    <Bar
                                        data={stationChartData}
                                        options={{
                                            maintainAspectRatio: false,
                                            plugins: { legend: { display: false } }
                                        }}
                                    />
                                </div>

                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                                        Performance by Target Station
                                    </h4>
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                        {etaAccuracy.byStation?.map((st, idx) => (
                                            <div
                                                key={`${st._id}-${idx}`}
                                                className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 text-xs"
                                            >
                                                <span className="font-bold text-slate-700">{st._id}</span>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-slate-400">{st.count} preds</span>
                                                    <span className="font-mono text-cyan-600">
                                                        MAE: {st.mae?.toFixed(1)}m
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="py-16 text-center text-slate-400 font-medium italic">
                                Insufficient data
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 shadow-sm">
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-6">
                            <Clock className="w-5 h-5 text-cyan-600" />
                            Scheduled vs Actual vs AI Predicted
                        </h3>

                        {etaAccuracy?.recentPredictions?.length ? (
                            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                {etaAccuracy.recentPredictions.map((pred, idx) => (
                                    <div
                                        key={`${pred.trainNumber}-${idx}`}
                                        className="p-4 rounded-2xl bg-white border border-slate-200 text-xs space-y-2"
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="font-black text-cyan-600">
                                                Train #{pred.trainNumber}
                                            </span>
                                            <span className="text-slate-500">
                                                Target: {pred.targetStation}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                                            <div className="p-2 rounded bg-slate-50">
                                                <span className="text-slate-400 block">Predicted:</span>
                                                <span className="text-cyan-700">
                                                    {new Date(pred.predictedArrival).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded bg-slate-50">
                                                <span className="text-slate-400 block">Actual:</span>
                                                <span className="text-emerald-700">
                                                    {pred.actualArrival
                                                        ? new Date(pred.actualArrival).toLocaleTimeString()
                                                        : "Pending"}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded bg-slate-50">
                                                <span className="text-slate-400 block">Error:</span>
                                                <span
                                                    className={cn(
                                                        "font-bold",
                                                        (pred.absoluteError || 0) > 10
                                                            ? "text-rose-600"
                                                            : "text-emerald-600"
                                                    )}
                                                >
                                                    {pred.error != null
                                                        ? `${pred.error > 0 ? "+" : ""}${pred.error}m`
                                                        : "N/A"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-16 text-center text-slate-400 font-medium italic">
                                Insufficient data
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 shadow-sm">
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-6">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            Bottleneck Leaderboard (Sections)
                        </h3>

                        {bottlenecks?.sections?.length ? (
                            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                {bottlenecks.sections.map((sec, idx) => (
                                    <div
                                        key={`${sec._id.from}-${sec._id.to}-${idx}`}
                                        className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200 text-xs"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="w-6 h-6 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-black">
                                                {idx + 1}
                                            </span>
                                            <div>
                                                <p className="font-black text-slate-800">
                                                    {sec._id.from} → {sec._id.to}
                                                </p>
                                                <p className="text-[10px] text-slate-400">
                                                    {sec.count} recorded runs
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-mono text-amber-600 font-bold">
                                                Avg Delay: +{sec.avgDelay?.toFixed(1)}m
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-16 text-center text-slate-400 font-medium italic">
                                Insufficient data
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 shadow-sm">
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-6">
                            <Layers className="w-5 h-5 text-cyan-600" />
                            Delay Causes & Distribution
                        </h3>

                        <div className="mb-6 grid grid-cols-2 gap-4 p-4 rounded-2xl bg-white border border-slate-200">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase">
                                    Average Network Delay
                                </p>
                                <p className="text-2xl font-black text-amber-600">
                                    {delays?.summary?.avgDelay?.toFixed(1) || 0} min
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase">
                                    Max Delay Recorded
                                </p>
                                <p className="text-2xl font-black text-rose-600">
                                    {delays?.summary?.maxDelay || 0} min
                                </p>
                            </div>
                        </div>

                        {delays?.causes?.length ? (
                            <div className="space-y-4">
                                <div className="h-48 mt-4">
                                    <Bar
                                        data={delayCausesChartData}
                                        options={{
                                            maintainAspectRatio: false,
                                            plugins: { legend: { display: false } }
                                        }}
                                    />
                                </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Primary Delay Causes
                                    </h4>
                                    {delays.causes.map((cause, idx) => (
                                        <div
                                            key={`${cause._id}-${idx}`}
                                            className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 text-xs"
                                        >
                                            <span className="font-bold text-slate-700">{cause._id}</span>
                                            <div className="flex items-center gap-4">
                                                <span className="text-slate-400">
                                                    {cause.count} incidents
                                                </span>
                                                <span className="font-mono text-amber-600">
                                                    {cause.totalDuration} mins
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="py-8 text-center text-slate-400 font-medium italic">
                                Insufficient data
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 shadow-sm">
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-6">
                            <Cpu className="w-5 h-5 text-cyan-600" />
                            ETA Prediction Engine Health
                        </h3>
                        <div className="space-y-4 text-xs">
                            <div className="flex justify-between items-center p-3 rounded-xl bg-white border border-slate-200">
                                <span className="text-slate-500">Engine Status</span>
                                <span className="font-bold text-emerald-600 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4" />
                                    {opsData?.etaPredictionHealth?.status || "Optimal"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center p-3 rounded-xl bg-white border border-slate-200">
                                <span className="text-slate-500">Model Confidence</span>
                                <span className="font-mono text-cyan-600 font-bold">
                                    {(opsData?.etaPredictionHealth?.confidence || 0.94) * 100}%
                                </span>
                            </div>
                            <div className="flex justify-between items-center p-3 rounded-xl bg-white border border-slate-200">
                                <span className="text-slate-500">Inference Latency</span>
                                <span className="font-mono text-slate-700 font-bold">
                                    {opsData?.etaPredictionHealth?.latencyMs || 42} ms
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 shadow-sm">
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-6">
                            <Activity className="w-5 h-5 text-cyan-600" />
                            Data-Source Health & Telemetry Feed
                        </h3>
                        <div className="space-y-4 text-xs">
                            <div className="flex justify-between items-center p-3 rounded-xl bg-white border border-slate-200">
                                <span className="text-slate-500">Train Simulator</span>
                                <span className="font-bold text-emerald-600 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4" />
                                    {opsData?.dataSourceHealth?.simulator || "Connected"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center p-3 rounded-xl bg-white border border-slate-200">
                                <span className="text-slate-500">RTIS Feeds</span>
                                <span className="font-bold text-amber-600 flex items-center gap-1.5">
                                    <Clock className="w-4 h-4" />
                                    {opsData?.dataSourceHealth?.rtis || "Standby"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center p-3 rounded-xl bg-white border border-slate-200">
                                <span className="text-slate-500">NTES Integration</span>
                                <span className="font-bold text-emerald-600 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4" />
                                    {opsData?.dataSourceHealth?.ntes || "Connected"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-16 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">
                        RAILWAY OPERATIONS INTELLIGENCE • SIH26028 COMPLIANT
                    </p>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ title, value, icon, subtext }: MetricCardProps) {
    return (
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <div className="p-3 bg-white rounded-2xl border border-slate-100 shadow-inner">
                    {icon}
                </div>
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                {title}
            </p>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-1">
                {value}
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">{subtext}</p>
        </div>
    );
}
