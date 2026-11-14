
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import { API_URL } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import {
  Train,
  Clock,
  MapPin,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Search,
  Activity,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/cn";
import BackButton from "@/components/BackButton";

interface TrainStatus {
  _id: string;
  trainNumber: string;
  name: string;
  source: string;
  destination: string;
  scheduledTime: string;
  estimatedTime: string;
  platform?: string;
  status: "OnTime" | "Delayed" | "Cancelled";
  delay?: number;
  liveStatusAvailable?: boolean;
  liveFallbackSource?: string;
  freshness?: string;
  isStale?: boolean;
}

const stationCodes = [
  { code: "NDLS", name: "New Delhi" },
  { code: "BCT", name: "Mumbai Central" },
  { code: "HWH", name: "Howrah" },
  { code: "MAS", name: "Chennai Central" },
  { code: "SBC", name: "Bangalore City" },
  { code: "PUNE", name: "Pune Junction" },
  { code: "CST", name: "Mumbai CST" },
  { code: "BZA", name: "Vijayawada" },
];

export default function LiveStation() {
  const { token } = useAuth();

  const [selectedStation, setSelectedStation] = useState("");
  const [activeTab, setActiveTab] = useState<"arrivals" | "departures">(
    "arrivals"
  );
  const [trains, setTrains] = useState<TrainStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStationStatus = useCallback(
    async (stationCode: string) => {
      if (!stationCode) {
        toast.error("Please select a station");
        return;
      }

      setLoading(true);

      try {
        const response = await axios.get(
          `${API_URL}/stations/${stationCode}/status?type=${activeTab}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        setTrains(response.data.trains);
        setLastUpdated(new Date());
      } catch (error: unknown) {
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message
          : undefined;

        toast.error(message || "Failed to fetch station status");
        setTrains([]);
      } finally {
        setLoading(false);
      }
    },
    [activeTab, token]
  );

  useEffect(() => {
    if (!selectedStation) return;

    fetchStationStatus(selectedStation);

    const interval = setInterval(() => {
      fetchStationStatus(selectedStation);
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedStation, activeTab, fetchStationStatus]);

  const formatDelay = (delay?: number) => {
    if (!delay || delay <= 0) return "On Time";

    const rounded = Math.round(delay);

    if (rounded < 60) return `+${rounded} min`;

    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;

    return mins > 0 ? `+${hours}h ${mins}m` : `+${hours}h`;
  };

  const getStatusBadge = (
    status: string,
    delay?: number,
    liveStatusAvailable?: boolean,
    liveFallbackSource?: string
  ) => {
    if (liveStatusAvailable === false) {
      return (
        <div className="flex flex-col gap-1 items-end">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-100 text-amber-700 font-black text-[10px] uppercase tracking-tighter shadow-sm">
            <AlertCircle className="w-3 h-3" />
            LIVE STATUS UNAVAILABLE
          </div>
          <span className="text-[8px] text-slate-400 font-bold uppercase">
            STATIC REFERENCE ONLY
          </span>
        </div>
      );
    }

    const isSim = liveFallbackSource === "SIMULATOR_FALLBACK";
    const sourceLabel = isSim ? "Simulator Fallback" : "RailRadar Live";

    switch (status) {
      case "OnTime":
        return (
          <div className="flex flex-col gap-1 items-end">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-100 text-green-700 font-black text-[10px] uppercase tracking-tighter shadow-sm">
              <CheckCircle className="w-3 h-3" />
              SCHEDULED NOMINAL
            </div>
            <span className="text-[8px] text-blue-500 font-bold uppercase">
              {sourceLabel}
            </span>
          </div>
        );

      case "Delayed":
        return (
          <div className="flex flex-col gap-1 items-end">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-100 text-amber-700 font-black text-[10px] uppercase tracking-tighter shadow-sm">
              <Clock className="w-3 h-3" />
              {formatDelay(delay)}
            </div>
            <span className="text-[8px] text-blue-500 font-bold uppercase">
              {sourceLabel}
            </span>
          </div>
        );

      case "Cancelled":
        return (
          <div className="flex flex-col gap-1 items-end">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 border border-red-100 text-red-700 font-black text-[10px] uppercase tracking-tighter shadow-sm">
              <AlertCircle className="w-3 h-3" />
              SERVICE SUSPENDED
            </div>
            <span className="text-[8px] text-blue-500 font-bold uppercase">
              {sourceLabel}
            </span>
          </div>
        );

      default:
        return null;
    }
  };

  const formatTime = (time: string) => {
    if (!time) return "--:--";

    try {
      if (!time.includes("-") && !time.includes("T")) {
        return time;
      }

      return new Date(time).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    } catch {
      return time;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <BackButton />

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
            <Activity className="w-4 h-4 text-blue-600 animate-pulse" />
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
              Live Telemetry Feed
            </span>
          </div>
        </div>

        <header className="mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 mb-2">
            Station <span className="text-blue-600">Telemetry</span>
          </h1>
          <p className="text-slate-500 font-medium">
            Real-time arrival and departure matrix for national nodes
          </p>
        </header>

        <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 mb-10 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <MapPin className="w-32 h-32" />
          </div>

          <div className="relative z-10">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 block px-1">
              Node Selection Registry
            </label>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {stationCodes.map((station) => (
                <button
                  key={station.code}
                  onClick={() => setSelectedStation(station.code)}
                  className={cn(
                    "group p-4 rounded-2xl border-2 transition-all duration-300 text-left relative overflow-hidden active:scale-95",
                    selectedStation === station.code
                      ? "border-blue-500 bg-blue-50 shadow-lg shadow-blue-100"
                      : "border-slate-100 hover:border-blue-400 bg-slate-50/50"
                  )}
                >
                  <div
                    className={cn(
                      "text-sm font-black tracking-tight uppercase group-hover:text-blue-600 transition-colors",
                      selectedStation === station.code
                        ? "text-blue-800"
                        : "text-slate-500"
                    )}
                  >
                    {station.code}
                  </div>

                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1 truncate">
                    {station.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {selectedStation && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between">
              <div className="inline-flex p-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                {(["arrivals", "departures"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-8 py-2.5 font-black text-xs uppercase tracking-widest rounded-xl transition-all duration-300",
                      activeTab === tab
                        ? "bg-slate-900 text-white shadow-lg"
                        : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-4 bg-white px-6 py-2.5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">
                    Last Sync
                  </p>
                  <p className="font-mono text-xs font-bold text-slate-600 mt-1">
                    {lastUpdated
                      ? lastUpdated.toLocaleTimeString("en-IN", {
                          hour12: false
                        })
                      : "WIDGET STANDBY"}
                  </p>
                </div>

                <button
                  onClick={() => fetchStationStatus(selectedStation)}
                  disabled={loading}
                  className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn("w-4 h-4", loading && "animate-spin")}
                  />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {loading && trains.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center gap-6 bg-white rounded-[2rem] border border-slate-200">
                  <div className="w-16 h-16 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                    Calibrating Node Stream...
                  </p>
                </div>
              ) : trains.length === 0 ? (
                <div className="bg-white rounded-[2rem] border border-slate-200 p-20 text-center shadow-sm">
                  <Search className="w-16 h-16 text-slate-100 mx-auto mb-6" />
                  <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">
                    Zero Node Activity
                  </h3>
                  <p className="text-slate-400 font-medium text-sm">
                    No services detected for the selected corridor in this timeframe.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  <AnimatePresence mode="popLayout">
                    {trains.map((train, index) => (
                      <motion.div
                        key={train._id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: index * 0.05 }}
                        className="bg-white rounded-[2rem] border border-slate-100 hover:border-blue-400 shadow-sm hover:shadow-2xl hover:shadow-blue-50 transition-all p-8 group overflow-hidden relative"
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-600/10 group-hover:bg-blue-600 transition-colors duration-500" />

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
                          <div className="lg:col-span-3 flex items-center gap-5">
                            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shadow-inner">
                              <Train className="w-7 h-7" />
                            </div>

                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono text-xs font-black text-slate-400 tracking-tighter shadow-sm">
                                  {train.trainNumber}
                                </span>
                                <div className="h-0.5 w-4 bg-slate-200" />
                              </div>

                              <h3 className="text-lg font-black text-slate-800 leading-tight uppercase group-hover:text-blue-600 transition-colors">
                                {train.name}
                              </h3>
                            </div>
                          </div>

                          <div className="lg:col-span-3 flex items-center gap-6">
                            <div className="flex-1 text-center">
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1.5">
                                Origin
                              </p>
                              <div className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-600 uppercase tracking-tighter">
                                {train.source}
                              </div>
                            </div>

                            <div className="flex flex-col items-center">
                              <ChevronRight className="w-4 h-4 text-blue-600 opacity-20 group-hover:opacity-100 transition-opacity" />
                            </div>

                            <div className="flex-1 text-center">
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1.5">
                                Destination
                              </p>
                              <div className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-600 uppercase tracking-tighter">
                                {train.destination}
                              </div>
                            </div>
                          </div>

                          <div className="lg:col-span-3 grid grid-cols-2 gap-6 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                            <div>
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">
                                Registry
                              </p>
                              <p className="text-xl font-black text-slate-800 leading-none">
                                {formatTime(train.scheduledTime)}
                              </p>
                            </div>

                            <div>
                              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">
                                Estimated
                              </p>
                              <p className="text-xl font-black text-blue-600 leading-none">
                                {formatTime(train.estimatedTime)}
                              </p>
                            </div>
                          </div>

                          <div className="lg:col-span-3 flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-4">
                            <div className="text-right">
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">
                                Platform
                              </p>

                              {train.platform ? (
                                <p className="text-2xl font-black text-slate-800 leading-none border-b-2 border-blue-600 inline-block">
                                  {train.platform}
                                </p>
                              ) : (
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-tight">
                                  --
                                </p>
                              )}
                            </div>

                            {getStatusBadge(
                              train.status,
                              train.delay,
                              train.liveStatusAvailable,
                              train.liveFallbackSource
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            <div className="p-10 text-center border-t border-slate-200">
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em]">
                SYSTEM AUTOMATION ACTIVE • 30S REFRESH INTERVAL
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
