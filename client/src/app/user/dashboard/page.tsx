
"use client";

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import BackButton from '@/components/BackButton';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/lib/constants';
import { Wallet, Ticket, TrendingUp, Clock, Bot } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

import AIAssistantWidget from '@/components/AIAssistantWidget';
import { YieldDistributionChart, AssetUtilizationChart } from '@/components/ChartCard';

interface DashboardBooking {
  _id: string;
  pnr: string;
  status: string;
  totalFare: number;
  train?: {
    name?: string;
    source?: string;
    destination?: string;
  };
}

interface DashboardData {
  user: {
    name: string;
    _id: string;
  };
  walletBalance: number;
  statistics: {
    totalBookings: number;
    completedBookings: number;
    upcomingBookings: number;
  };
  yield?: {
    ac?: number;
    sleeper?: number;
    general?: number;
  };
  utilization?: number[];
  recentBookings: DashboardBooking[];
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  color: string;
}

interface ActionCardProps {
  href: string;
  title: string;
  desc: string;
  icon: ReactNode;
  primary?: boolean;
}

export default function UserDashboard() {
  const { token } = useAuth();

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const recentBookings = dashboardData?.recentBookings ?? [];

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await axios.get<{ data: DashboardData }>(
          `${API_URL}/users/dashboard`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );

        setDashboardData(response.data.data);
      } catch (error) {
        toast.error('Failed to load dashboard');
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchDashboard();
    } else {
      setLoading(false);
    }
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-blue-600"></div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            Preparing Dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-blue-100 font-sans p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <BackButton />

        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-extrabold text-blue-100 tracking-tight leading-none mb-3">
              Welcome, <span className="text-blue-400">{dashboardData?.user.name}</span>
            </h1>
            <p className="text-blue-400 font-medium flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              Your travel registry is up to date
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">
                User Identification
              </p>
              <p className="text-sm font-mono font-bold text-slate-600">
                RC-{dashboardData?.user._id?.slice(-8).toUpperCase()}
              </p>
            </div>

            <Link href="/ai-assistant">
              <button className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm uppercase tracking-wider transition-all shadow-lg shadow-blue-200 hover:shadow-xl flex items-center gap-2">
                <Bot className="w-5 h-5" />
                <span className="hidden lg:inline">AI Assistant</span>
              </button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <StatCard
            label="Wallet Balance"
            value={`₹${dashboardData?.walletBalance || 0}`}
            icon={<Wallet className="w-6 h-6" />}
            color="bg-blue-900"
          />

          <StatCard
            label="Total Bookings"
            value={dashboardData?.statistics.totalBookings || 0}
            icon={<Ticket className="w-6 h-6" />}
            color="bg-blue-800"
          />

          <StatCard
            label="Journeys Completed"
            value={dashboardData?.statistics.completedBookings || 0}
            icon={<TrendingUp className="w-6 h-6" />}
            color="bg-blue-700"
          />

          <StatCard
            label="Pending Travel"
            value={dashboardData?.statistics.upcomingBookings || 0}
            icon={<Clock className="w-6 h-6" />}
            color="bg-blue-600"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Yield Distribution
            </h2>

            <YieldDistributionChart
              data={{
                labels: ["AC", "Sleeper", "General"],
                values: [
                  dashboardData?.yield?.ac || 25,
                  dashboardData?.yield?.sleeper || 55,
                  dashboardData?.yield?.general || 20
                ]
              }}
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-600" />
              Asset Utilization
            </h2>

            <AssetUtilizationChart
              data={{
                labels: ["Jan", "Feb", "Mar", "Apr", "May"],
                values: dashboardData?.utilization || [60, 70, 80, 75, 90]
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-blue-900/60 rounded-2xl border border-blue-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-blue-800 flex justify-between items-center">
                <h2 className="text-lg font-bold text-blue-100">
                  Recent Transit Records
                </h2>

                <Link
                  href="/search"
                  className="text-xs font-bold text-blue-300 hover:text-blue-100 uppercase tracking-widest"
                >
                  Book New Journey
                </Link>
              </div>

              <div className="p-2">
                {recentBookings.length > 0 ? (
                  <div className="divide-y divide-blue-800/40">
                    {recentBookings.map((booking) => (
                      <Link
                        key={booking._id}
                        href={`/booking/${booking._id}`}
                      >
                        <div className="p-4 hover:bg-blue-800/30 rounded-xl transition-all cursor-pointer group">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors border border-slate-100 shadow-inner">
                                <Ticket className="w-6 h-6" />
                              </div>

                              <div>
                                <p className="font-bold text-slate-800 text-base leading-tight uppercase tracking-tight">
                                  {booking.train?.name}
                                </p>

                                <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-tighter">
                                  {booking.train?.source}
                                  <span className="text-blue-500 mx-1">→</span>
                                  {booking.train?.destination}
                                </p>
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="font-mono font-bold text-xs text-slate-500 uppercase tracking-widest mb-1">
                                PNR: {booking.pnr}
                              </p>

                              <div className="flex items-center gap-2 justify-end">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                    booking.status === 'Confirmed'
                                      ? 'bg-green-50 text-green-600 border border-green-100'
                                      : 'bg-amber-50 text-amber-600 border border-amber-100'
                                  }`}
                                >
                                  {booking.status}
                                </span>

                                <p className="text-slate-800 font-extrabold">
                                  ₹{booking.totalFare}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <Ticket className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
                      No active transit records
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] px-2 mb-2">
              Service Access
            </h3>

            <AIAssistantWidget variant="inline" className="mb-4" />

            <ActionCard
              href="/search"
              title="Flight/Train Search"
              desc="Access global inventory"
              icon={<Ticket className="w-5 h-5" />}
              primary
            />

            <ActionCard
              href="/my-bookings"
              title="Booking Registry"
              desc="Manage existing records"
              icon={<Clock className="w-5 h-5" />}
            />

            <ActionCard
              href="/wallet"
              title="Wallet Terminal"
              desc="Currency & audits"
              icon={<Wallet className="w-5 h-5" />}
            />

            <div className="pt-4 border-t border-slate-200 mt-6">
              <Link href="/ai-assistant">
                <div className="bg-slate-900 rounded-2xl p-6 text-white hover:shadow-xl transition-all relative overflow-hidden group">
                  <div className="absolute right-[-20px] bottom-[-20px] opacity-10 group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-32 h-32" />
                  </div>

                  <div className="relative z-10 flex flex-col gap-3">
                    <div className="bg-blue-600 w-10 h-10 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
                      <span className="text-xl">🤖</span>
                    </div>

                    <div>
                      <h4 className="font-bold text-lg leading-tight mb-1">
                        AI Smart Assistant
                      </h4>
                      <p className="text-xs text-slate-400 font-medium leading-relaxed">
                        Ask about route optimization, fare trends, and status updates.
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-300 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl ${color} text-white shadow-lg shadow-black/5`}>
          {icon}
        </div>

        <div className="h-1.5 w-12 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${color} w-3/4 animate-pulse`}></div>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-1.5">
        {label}
      </p>

      <p className="text-2xl font-black text-slate-800 group-hover:text-blue-600 transition-colors uppercase">
        {value}
      </p>
    </div>
  );
}

function ActionCard({ href, title, desc, icon, primary = false }: ActionCardProps) {
  return (
    <Link href={href}>
      <div
        className={`p-5 rounded-2xl border transition-all flex items-center gap-4 group ${
          primary
            ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100"
            : "bg-white text-slate-800 border-slate-200 shadow-sm hover:border-blue-400"
        }`}
      >
        <div
          className={`p-3 rounded-xl ${
            primary
              ? 'bg-white/10'
              : 'bg-slate-100 text-slate-600 group-hover:text-blue-600 group-hover:bg-blue-50'
          } transition-all`}
        >
          {icon}
        </div>

        <div>
          <h4 className="font-bold text-sm leading-none mb-1.5">
            {title}
          </h4>

          <p
            className={`text-[10px] leading-none font-bold uppercase tracking-tighter ${
              primary ? 'text-blue-100' : 'text-slate-400'
            }`}
          >
            {desc}
          </p>
        </div>
      </div>
    </Link>
  );
}
