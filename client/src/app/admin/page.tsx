
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Users,
  Train,
  DollarSign,
  Calendar,
  Bot,
  LogOut,
  LayoutDashboard
} from "lucide-react";
import Link from "next/link";
import { API_URL } from "@/lib/constants";
import AIAssistantWidget from "@/components/AIAssistantWidget";
import BackButton from "@/components/BackButton";

interface DashboardStats {
  totalBookings: number;
  totalRevenue: number;
  totalUsers: number;
  totalTrains: number;
  bookingsThisMonth: number;
  revenueThisMonth: number;
}

interface RecentBooking {
  _id: string;
  user: { name: string; email: string };
  train: { name: string };
  passengers: number;
  status: string;
  totalPrice: number;
  createdAt: string;
}

interface ApiRecentBooking {
  _id?: string;
  user?: { name?: string; email?: string };
  train?: { name?: string };
  passengers?: unknown[];
  status?: string;
  totalFare?: number;
  createdAt?: string;
}

interface DashboardApiResponse {
  totalBookings?: number;
  totalRevenue?: number;
  totalUsers?: number;
  totalTrains?: number;
  recentBookings?: ApiRecentBooking[];
}

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  change: string;
  color: string;
}

export default function AdminDashboard() {
  const { user, token, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      console.log("Fetching admin dashboard...");

      const statsRes = await axios.get<DashboardApiResponse>(
        `${API_URL}/analytics/dashboard`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("Dashboard data received:", statsRes.data);

      setStats({
        totalBookings: statsRes.data.totalBookings || 0,
        totalRevenue: statsRes.data.totalRevenue || 0,
        totalUsers: statsRes.data.totalUsers || 0,
        totalTrains: statsRes.data.totalTrains || 0,
        bookingsThisMonth: statsRes.data.recentBookings?.length || 0,
        revenueThisMonth: statsRes.data.totalRevenue || 0,
      });

  
setRecentBookings(
  statsRes.data.recentBookings?.map((booking, index) => ({
    _id: booking._id || `booking-${index}`,
    user: {
      name: booking.user?.name || "Unknown",
      email: booking.user?.email || "",
    },
    train: {
      name: booking.train?.name || "Unknown",
    },
    passengers: booking.passengers?.length || 1,
    status: booking.status || "Pending",
    totalPrice: booking.totalFare || 0,
    createdAt: booking.createdAt || new Date().toISOString(),
  })) || []
);

    } catch (error: unknown) {
      if (axios.isAxiosError<{ message?: string }>(error)) {
        console.error(
          "Failed to load dashboard:",
          error.response?.data || error.message
        );
        toast.error(
          error.response?.data?.message ||
            "Admin Error: Failed to load dashboard statistics"
        );
      } else {
        console.error("Failed to load dashboard:", error);
        toast.error("Admin Error: Failed to load dashboard statistics");
      }

      setStats({
        totalBookings: 0,
        totalRevenue: 0,
        totalUsers: 0,
        totalTrains: 0,
        bookingsThisMonth: 0,
        revenueThisMonth: 0,
      });

      setRecentBookings([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (authLoading) return;

    if (!user || user.role !== "admin") {
      router.push("/");
      return;
    }

    fetchDashboard();
  }, [user, token, router, authLoading, fetchDashboard]);

  const menuItems = [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { label: "Manage Trains", href: "/admin/trains", icon: Train },
    { label: "User Management", href: "/admin/users", icon: Users },
    { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    { label: "Operations Intel", href: "/admin/operations", icon: Activity },
    { label: "AI Insights", href: "/ai-assistant", icon: Bot },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex">
      <motion.aside
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0 }}
        className="w-64 bg-gradient-to-br from-blue-900 via-blue-950 to-slate-900 border-r border-blue-900 hidden md:flex flex-col shadow-xl"
      >
        <div className="p-6 border-b border-blue-900">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            RailConnect
          </h1>
          <p className="text-xs text-blue-200 mt-1">Admin Configuration</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => (
            <Link key={item.label} href={item.href}>
              <div className="flex items-center gap-3 px-4 py-3 text-blue-100 hover:bg-blue-800/40 rounded-lg transition-all cursor-pointer group">
                <item.icon className="w-5 h-5 group-hover:text-blue-400" />
                <span className="font-medium">{item.label}</span>
              </div>
            </Link>
          ))}

          <div className="pt-4 mt-4 border-t border-blue-900">
            <Link href="/">
              <div className="flex items-center gap-3 px-4 py-3 text-blue-400 hover:text-blue-200 hover:bg-blue-800/40 rounded-lg transition-all cursor-pointer">
                <LayoutDashboard className="w-5 h-5" />
                <span className="font-medium">Back to Home</span>
              </div>
            </Link>
          </div>
        </nav>

        <div className="p-4 border-t border-blue-900">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-900/30 rounded-lg w-full transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </motion.aside>

      <main className="flex-1 overflow-y-auto bg-white">
        <AIAssistantWidget variant="floating" />

        <div className="p-8">
          <BackButton />

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex justify-between items-center"
          >
            <div>
              <h1 className="text-3xl font-bold text-blue-900 mb-2">
                Welcome back, {user?.name}
              </h1>
              <p className="text-blue-500">
                Here&apos;s what&apos;s happening on the network today.
              </p>
            </div>

            <div className="flex gap-3 items-center">
              <button
                onClick={() => router.push("/admin/trains")}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-200 flex items-center gap-2"
              >
                <Train className="w-4 h-4" />
                Manage Trains
              </button>

              <button
                onClick={() => router.push("/ai-assistant")}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
              >
                <Bot className="w-4 h-4" />
                AI Operations
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          >
            <StatCard
              icon={<DollarSign className="w-8 h-8" />}
              label="Total Revenue"
              value={`₹${(stats?.totalRevenue || 0).toLocaleString()}`}
              change="+12.5%"
              color="from-green-300 to-emerald-400"
            />

            <StatCard
              icon={<Users className="w-8 h-8" />}
              label="Total Users"
              value={stats?.totalUsers || 0}
              change="+5.2%"
              color="from-blue-200 to-indigo-300"
            />

            <StatCard
              icon={<Train className="w-8 h-8" />}
              label="Active Trains"
              value={stats?.totalTrains || 0}
              change="All Active"
              color="from-purple-200 to-pink-200"
            />

            <StatCard
              icon={<BarChart3 className="w-8 h-8" />}
              label="Total Bookings"
              value={stats?.totalBookings || 0}
              change="+8.1%"
              color="from-orange-200 to-red-200"
            />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 20 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-2 bg-gradient-to-br from-blue-50 via-white to-slate-100 rounded-xl border border-blue-100 overflow-hidden"
            >
              <div className="p-6 border-b border-blue-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-blue-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  Recent Transit Ledger
                </h2>

                <button
                  onClick={() => router.push("/admin/bookings")}
                  className="text-sm text-blue-500 hover:text-blue-700"
                >
                  View All
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-blue-900">
                  <thead className="bg-blue-50/50 text-blue-400 text-sm uppercase">
                    <tr>
                      <th className="px-6 py-4 font-medium">Passenger</th>
                      <th className="px-6 py-4 font-medium">Train</th>
                      <th className="px-6 py-4 font-medium">Amount</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-blue-100">
                    {recentBookings.map((booking) => (
                      <tr
                        key={booking._id}
                        className="hover:bg-blue-50 transition"
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-blue-900">
                            {booking.user.name}
                          </div>
                          <div className="text-xs text-blue-400">
                            {booking.user.email}
                          </div>
                        </td>

                        <td className="px-6 py-4">{booking.train.name}</td>

                        <td className="px-6 py-4 font-mono text-blue-900">
                          ₹{booking.totalPrice.toLocaleString()}
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                              booking.status === "confirmed"
                                ? "bg-green-200 text-green-700"
                                : "bg-yellow-200 text-yellow-700"
                            }`}
                          >
                            {booking.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-indigo-100 to-blue-100 rounded-xl border border-indigo-200 p-6 text-blue-900"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Bot className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold">AI Assistant</h3>
              </div>

              <p className="text-indigo-500 mb-6 text-sm">
                Need operational insights, passenger flow status or train
                performance updates? Ask your AI copilot.
              </p>

              <button
                onClick={() => router.push("/ai-assistant")}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition shadow-lg"
              >
                Launch AI Chat
              </button>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, change, color }: StatCardProps) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className={`relative overflow-hidden rounded-xl p-6 bg-gradient-to-br ${color} shadow-lg`}
    >
      <div className="relative z-10 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
            {icon}
          </div>
          <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded">
            {change}
          </span>
        </div>

        <p className="text-sm font-medium opacity-90">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </div>

      <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
    </motion.div>
  );
}
