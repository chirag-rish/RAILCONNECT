
"use client";

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API_URL } from '@/lib/constants';
import {
    BarChart3,
    Users,
    Train,
    TrendingUp,
    IndianRupee,
    LayoutDashboard,
    Database,
    ShieldCheck,
    ChevronRight
} from 'lucide-react';

import Link from 'next/link';
import { YieldDistributionChart, AssetUtilizationChart } from '@/components/ChartCard';

interface RecentBooking {
    _id: string;
    user?: {
        name?: string;
        email?: string;
    };
    train?: {
        name?: string;
        trainNumber?: string;
    };
    createdAt: string;
    totalFare: number;
    status: string;
}

interface AdminDashboardStats {
    totalBookings: number;
    totalRevenue: number;
    totalUsers: number;
    totalTrains: number;
    yield?: {
        ac?: number;
        sleeper?: number;
        general?: number;
    };
    utilizationLabels?: string[];
    utilization?: number[];
    recentBookings: RecentBooking[];
}

interface AdminStatCardProps {
    label: string;
    value: string | number;
    icon: ReactNode;
    trend: string;
    color: string;
    bg: string;
}

export default function AdminDashboard() {
    const { user, token } = useAuth();
    const [stats, setStats] = useState<AdminDashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || user.role !== 'admin') return;

        const fetchStats = async () => {
            try {
                const config = {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                };

                const { data } = await axios.get<AdminDashboardStats>(
                    `${API_URL}/analytics/dashboard`,
                    config
                );

                setStats(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [user, token]);

    if (!user || user.role !== 'admin') {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-100 text-center max-w-md">
                    <ShieldCheck className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-slate-800 mb-2">Access Restricted</h1>
                    <p className="text-slate-500 text-sm mb-6">
                        This terminal requires Level 1 Administrative Clearance.
                    </p>
                    <Link href="/login" className="inline-block bg-slate-900 text-white px-6 py-2 rounded-xl text-sm font-bold">
                        Return to Login
                    </Link>
                </div>
            </div>
        );
    }

    if (loading) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-blue-600"></div>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                    Accessing Central Database...
                </p>
            </div>
        </div>
    );

    const dashboardStats = stats ?? {
        totalBookings: 0,
        totalRevenue: 0,
        totalUsers: 0,
        totalTrains: 0,
        recentBookings: []
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-10">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                    <div>
                        <div className="flex items-center gap-2 text-blue-600 font-bold text-[10px] uppercase tracking-[0.3em] mb-2">
                            <LayoutDashboard className="w-4 h-4" />
                            Control Center
                        </div>
                        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">
                            Admin Terminal
                        </h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <Link href="/admin/trains" className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm">
                            <Database className="w-4 h-4" /> Manage Inventory
                        </Link>

                        <Link href="/admin/add-train" className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2">
                            + Add New Train
                        </Link>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                    <AdminStatCard
                        label="Total Transits"
                        value={dashboardStats.totalBookings}
                        icon={<BarChart3 className="w-5 h-5" />}
                        trend="+12.4%"
                        color="text-blue-600"
                        bg="bg-blue-50"
                    />

                    <AdminStatCard
                        label="Aggregate Revenue"
                        value={`₹${dashboardStats.totalRevenue.toLocaleString()}`}
                        icon={<IndianRupee className="w-5 h-5" />}
                        trend="+8.2%"
                        color="text-green-600"
                        bg="bg-green-50"
                    />

                    <AdminStatCard
                        label="User Registry"
                        value={dashboardStats.totalUsers}
                        icon={<Users className="w-5 h-5" />}
                        trend="+4.1%"
                        color="text-purple-600"
                        bg="bg-purple-50"
                    />

                    <AdminStatCard
                        label="Active Carriers"
                        value={dashboardStats.totalTrains}
                        icon={<Train className="w-5 h-5" />}
                        trend="Stable"
                        color="text-orange-600"
                        bg="bg-orange-50"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-blue-600" /> Yield Distribution
                        </h2>

                        <YieldDistributionChart data={{
                            labels: ["AC", "Sleeper", "General"],
                            values: [
                                dashboardStats.yield?.ac || 30,
                                dashboardStats.yield?.sleeper || 50,
                                dashboardStats.yield?.general || 20
                            ]
                        }} />
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-blue-600" /> Asset Utilization
                        </h2>

                        <AssetUtilizationChart data={{
                            labels: dashboardStats.utilizationLabels || ["May", "Jun", "Jul", "Aug", "Sep"],
                            values: dashboardStats.utilization || [0, 0, 0, 0, 0]
                        }} />
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-slate-800">
                            Recent Transit Ledger
                        </h3>

                        <Link href="/admin/bookings" className="text-[10px] font-bold text-slate-400 hover:text-blue-600 uppercase tracking-widest flex items-center gap-1">
                            Full Period Audit <ChevronRight className="w-3 h-3" />
                        </Link>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                                    <th className="p-5 pl-8">Passenger Entity</th>
                                    <th className="p-5">Service Carrier</th>
                                    <th className="p-5">Registry Date</th>
                                    <th className="p-5 text-center">Value</th>
                                    <th className="p-5 pr-8 text-right">Status</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-50">
                                {dashboardStats.recentBookings.map((booking) => (
                                    <tr key={booking._id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="p-5 pl-8">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs uppercase shadow-inner">
                                                    {booking.user?.name?.[0] || 'U'}
                                                </div>

                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm leading-none uppercase">
                                                        {booking.user?.name || 'Anonymous'}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 mt-1 lowercase font-medium">
                                                        {booking.user?.email || 'no-email'}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="p-5">
                                            <p className="text-slate-700 font-bold text-sm uppercase leading-none">
                                                {booking.train?.name}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-1 font-mono">
                                                #{booking.train?.trainNumber || 'N/A'}
                                            </p>
                                        </td>

                                        <td className="p-5 text-sm text-slate-500 font-medium">
                                            {new Date(booking.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                        </td>

                                        <td className="p-5 text-center font-extrabold text-slate-900">
                                            ₹{booking.totalFare}
                                        </td>

                                        <td className="p-5 pr-8 text-right">
                                            <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                                                booking.status === 'Confirmed'
                                                    ? 'bg-green-50 text-green-700 border border-green-100'
                                                    : 'bg-amber-50 text-amber-700 border border-amber-100'
                                            }`}>
                                                {booking.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AdminStatCard({ label, value, icon, trend, color, bg }: AdminStatCardProps) {
    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-300 transition-all group">
            <div className="flex items-center justify-between mb-4">
                <div className={`p-4 rounded-xl ${bg} ${color} shadow-sm border border-slate-50`}>
                    {icon}
                </div>

                <span className={`text-[10px] font-black uppercase tracking-tighter ${trend === 'Stable' ? 'text-slate-400' : 'text-green-500'}`}>
                    {trend}
                </span>
            </div>

            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-1.5">
                {label}
            </p>

            <div className="flex items-baseline gap-1">
                <p className="text-2xl font-black text-slate-800 group-hover:text-blue-600 transition-colors uppercase">
                    {value}
                </p>
            </div>
        </div>
    );
}
