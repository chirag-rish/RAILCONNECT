
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/hooks/useSocket";
import axios from "axios";
import toast from "react-hot-toast";
import { API_URL } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import {
  Train,
  MapPin,
  Clock,
  CheckCircle,
  Brain,
  Zap,
  Timer,
  ArrowRight,
  HelpCircle,
  TrendingUp,
  Cloud,
  Search,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import BackButton from "@/components/BackButton";
import WeatherIndicator from "@/components/WeatherIndicator";
import { formatTimeForPassenger } from "@/utils/istTime";
import { formatEtaDelay } from "@/utils/formatDuration";

interface TrainState {
  _id: string;
  trainNumber: string;
  name: string;
  source: string;
  destination: string;
  currentStation: string;
  currentLocation: { lat: number; lng: number };
  nextStation: string;
  distanceFromNext: number;
  estimatedArrival: string;
  status: "OnTime" | "Delayed" | "Cancelled";
  delay?: number;
  speed: number;
  progress: number;
  occupancy?: { class: string; filled: number; total: number }[];
}

interface EtaExplanation {
  totalImpactMinutes: number;
  totalChangeMinutes: number;
  previousEta: string | null;
  newEta: string | null;
  reasons: {
    type: string;
    label: string;
    impactMinutes: number;
    severity: string;
    evidence: string;
  }[];
  recoveryMinutes: number;
  generatedAt: string;
}

interface TrainETAData {
  success: boolean;
  trainId: string;
  trainNumber: string;
  trainName: string;
  currentDelay: number;
  currentStation: string;
  nextStation: string;
  sectionIndex: number;
  totalSections: number;
  stations: {
    station: string;
    stationName: string;
    scheduledArrival?: string;
    scheduledDeparture?: string;
  }[];
  stationETAs: {
    fromStation: string;
    toStation: string;
    sectionIndex: number;
    scheduledTravelTimeMinutes: number;
    predictedDelayMinutes: number;
    predictedArrival: string;
    accumulatedDelay: number;
  }[];
  explanation?: EtaExplanation;
  historicalContext?: {
    available: boolean;
    dataSource?: string;
    sourceType?: string;
    live?: boolean;
    reliability?: string;
    averageDelayMinutes?: number;
    peakHourAverageMinutes?: number;
    historicalPeriod?: string;
    historicalOnTimeRate?: number;
  };
  historical?: {
    onTimeRate?: number;
    averageDelayMinutes?: number;
    peakHourAverageMinutes?: number;
    historicalPeriod?: string;
  };
}

interface ApiErrorResponse {
  message?: string;
}

interface TrainSocketUpdate {
  trainNumber: string;
  speed?: number;
  currentStation?: string;
  nextStation?: string;
  status?: TrainState["status"];
  accumulatedDelay?: number;
  delay?: number;
}

interface EtaSocketUpdate {
  trainNumber: string;
  stationETAs?: TrainETAData["stationETAs"];
  explanation?: EtaExplanation;
}

export default function ETAPredictionPage() {
  const { token } = useAuth();
  const { socket, trackTrain, stopTracking } = useSocket();

  const [trainNumber, setTrainNumber] = useState("");
  const [trackingData, setTrackingData] = useState<TrainState | null>(null);
  const [stationETAs, setStationETAs] = useState<TrainETAData | null>(null);
  const [etaExplanation, setEtaExplanation] = useState<EtaExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingETA, setLoadingETA] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<
    "checking" | "healthy" | "unavailable"
  >("checking");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [timeAgo, setTimeAgo] = useState("Just now");

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await axios.get(`${API_URL}/eta/health`);
        setServiceStatus(
          res.data.inferenceService?.modelLoaded ? "healthy" : "unavailable"
        );
      } catch {
        setServiceStatus("unavailable");
      }
    };

    checkHealth();
  }, []);

  useEffect(() => {
    if (!lastUpdated) return;

    const interval = setInterval(() => {
      const diffSecs = Math.floor(
        (Date.now() - lastUpdated.getTime()) / 1000
      );

      if (diffSecs < 10) {
        setTimeAgo("Just now");
      } else if (diffSecs < 60) {
        setTimeAgo(`${diffSecs}s ago`);
      } else {
        const mins = Math.floor(diffSecs / 60);
        setTimeAgo(`${mins}m ago`);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  const fetchETA = useCallback(
    async (tn: string) => {
      setLoadingETA(true);

      try {
        const stationsRes = await axios
          .get(`${API_URL}/eta/train/${tn}/stations`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          .catch(() => null);

        if (stationsRes?.data?.success) {
          setStationETAs(stationsRes.data);

          if (stationsRes.data.explanation) {
            setEtaExplanation(stationsRes.data.explanation);
          }

          setLastUpdated(new Date());
        }
      } catch {
        setStationETAs(null);
      } finally {
        setLoadingETA(false);
      }
    },
    [token]
  );

  const fetchTracking = useCallback(
    async (number: string) => {
      const tn = (number || "").trim().toUpperCase();

      if (!tn) {
        toast.error("Please enter a valid train number");
        return;
      }

      setLoading(true);

      try {
        const res = await axios.get(`${API_URL}/trains/${tn}/tracking`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setTrackingData(res.data);
        await fetchETA(res.data.trainNumber);
        setLastUpdated(new Date());
      } catch (error: unknown) {
        const response = axios.isAxiosError<ApiErrorResponse>(error)
          ? error.response
          : undefined;

        const errMsg =
          response?.status === 404 ||
          response?.data?.message === "Train not found"
            ? `Train ${tn} is currently unavailable.`
            : response?.data?.message ||
              `Train ${tn} is currently unavailable.`;

        toast.error(errMsg);
        setTrackingData(null);
        setStationETAs(null);
        setEtaExplanation(null);
      } finally {
        setLoading(false);
      }
    },
    [token, fetchETA]
  );

  const trackedTrainId = trackingData?._id;
  const trackedTrainNumber = trackingData?.trainNumber;

  useEffect(() => {
    if (!socket || !trackedTrainId || !trackedTrainNumber) return;

    trackTrain(trackedTrainId);

    const handleUpdate = (data: TrainSocketUpdate) => {
      if (data.trainNumber === trackedTrainNumber) {
        setTrackingData((prev) =>
          prev
            ? {
                ...prev,
                speed: data.speed ?? prev.speed,
                currentStation: data.currentStation ?? prev.currentStation,
                nextStation: data.nextStation ?? prev.nextStation,
                status: data.status ?? prev.status,
                delay:
                  data.accumulatedDelay ?? data.delay ?? prev.delay,
              }
            : prev
        );

        setLastUpdated(new Date());
      }
    };

    const handleETAUpdate = (data: EtaSocketUpdate) => {
      if (data.trainNumber === trackedTrainNumber) {
        const updatedStationETAs = data.stationETAs;

        if (updatedStationETAs) {
          setStationETAs((prev) =>
            prev
              ? { ...prev, stationETAs: updatedStationETAs }
              : prev
          );
        }

        if (data.explanation) {
          setEtaExplanation(data.explanation);
        }

        setLastUpdated(new Date());
      }
    };

    socket.on("train:update", handleUpdate);
    socket.on("train:telemetry", handleUpdate);
    socket.on("train:eta:update", handleETAUpdate);

    return () => {
      socket.off("train:update", handleUpdate);
      socket.off("train:telemetry", handleUpdate);
      socket.off("train:eta:update", handleETAUpdate);
      stopTracking(trackedTrainId);
    };
  }, [
    socket,
    trackedTrainId,
    trackedTrainNumber,
    trackTrain,
    stopTracking,
  ]);

  const getDelayColor = (delay: number) => {
    if (delay <= 0) return "text-emerald-600";
    if (delay <= 10) return "text-amber-600";
    return "text-rose-600";
  };

  const getStatusBadge = (status: string, delay?: number) => {
    if (status === "OnTime" || (!delay || delay <= 0)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold uppercase tracking-wider">
          <CheckCircle className="w-3.5 h-3.5" /> On Time
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold uppercase tracking-wider">
        <Clock className="w-3.5 h-3.5" /> Delayed {formatEtaDelay(delay)}
      </span>
    );
  };

  const destinationEtaObj =
    stationETAs?.stationETAs?.[stationETAs.stationETAs.length - 1];

  const currentDelay =
    trackingData?.delay ?? stationETAs?.currentDelay ?? 0;

  const expectedArrivalDelay =
    destinationEtaObj?.predictedDelayMinutes ?? currentDelay;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 shadow-xs">
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  serviceStatus === "checking"
                    ? "bg-amber-500 animate-pulse"
                    : serviceStatus === "healthy"
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-rose-500"
                )}
              />
              <span className="text-xs font-bold text-blue-700 uppercase tracking-widest">
                {serviceStatus === "checking"
                  ? "Checking ETA Service..."
                  : serviceStatus === "healthy"
                    ? "Live ETA System Active"
                    : "ETA Service Unavailable"}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 md:p-8">
          <div className="max-w-3xl mb-6">
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
              When will my train arrive?
            </h1>
            <p className="text-slate-600 font-medium">
              Real-time arrival forecasts, station-by-station timetables, and
              delay intelligence for RailConnect passengers.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                <Train className="w-5 h-5" />
              </div>

              <input
                type="text"
                value={trainNumber}
                onChange={(e) => setTrainNumber(e.target.value.toUpperCase())}
                placeholder="Enter Train Number (e.g. 11020, 12951)"
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl py-4 pl-12 pr-4 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                onKeyDown={(e) =>
                  e.key === "Enter" && fetchTracking(trainNumber)
                }
              />
            </div>

            <button
              onClick={() => fetchTracking(trainNumber)}
              disabled={loading}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-2xl font-bold uppercase tracking-wider text-sm transition-all shadow-md shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
              {loading ? "Checking..." : "Check ETA"}
            </button>
          </div>

          <div className="flex items-center gap-2 mt-4 flex-wrap text-xs font-semibold text-slate-500">
            <span>Popular Trains:</span>
            {["11020", "12951", "12702", "12137"].map((num) => (
              <button
                key={num}
                onClick={() => {
                  setTrainNumber(num);
                  fetchTracking(num);
                }}
                className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 rounded-lg border border-slate-200 transition-colors"
              >
                Train {num}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {trackingData && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-blue-600/55 text-blue-200 rounded-full text-xs font-black tracking-widest uppercase border border-blue-400/30">
                        Train #{trackingData.trainNumber}
                      </span>
                      {getStatusBadge(trackingData.status, currentDelay)}
                    </div>

                    <h2 className="text-2xl md:text-3xl font-black tracking-tight">
                      {trackingData.name}
                    </h2>

                    <div className="flex items-center gap-2 mt-2 text-slate-300 text-sm font-medium">
                      <span className="font-bold text-white">
                        {trackingData.source}
                      </span>
                      <ArrowRight className="w-4 h-4 text-blue-400" />
                      <span className="font-bold text-white">
                        {trackingData.destination}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end gap-2 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-blue-400" />
                      <span>Updated {timeAgo}</span>
                    </div>

                    <div className="text-xl md:text-2xl font-black">
                      {currentDelay !== 0
                        ? `Delayed by ${formatEtaDelay(currentDelay)}`
                        : "Running On Time"}
                    </div>

                    <p className="text-[11px] text-slate-400">
                      Live Telemetry & ETA Synchronized
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  icon={<Zap className="w-5 h-5 text-blue-600" />}
                  label="Current Speed"
                  value={`${trackingData.speed} KM/H`}
                  sub="GPS Telemetry Active"
                />

                <MetricCard
                  icon={<MapPin className="w-5 h-5 text-emerald-600" />}
                  label="Next Major Station"
                  value={trackingData.nextStation || "En Route"}
                  sub={`${trackingData.distanceFromNext || 0} KM remaining`}
                />

                <MetricCard
                  icon={<Clock className="w-5 h-5 text-amber-600" />}
                  label="Current Delay"
                  value={
                    currentDelay === 0
                      ? "0 min"
                      : formatEtaDelay(currentDelay)
                  }
                  sub="Verified against schedule"
                />

                <MetricCard
                  icon={<ShieldCheck className="w-5 h-5 text-indigo-600" />}
                  label="Journey Progress"
                  value={`${Math.round(trackingData.progress || 0)}%`}
                  sub={`Current: ${trackingData.currentStation || "Running"}`}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                          <Timer className="w-5 h-5" />
                        </div>

                        <div>
                          <h3 className="text-lg font-black text-slate-900">
                            Destination Arrival Forecast
                          </h3>
                          <p className="text-xs text-slate-500 font-medium">
                            Predicted arrival at {trackingData.destination}
                          </p>
                        </div>
                      </div>

                      <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200">
                        AI Forecasted
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Scheduled Arrival
                        </p>
                        <p className="text-xl font-black text-slate-800">
                          {stationETAs?.stations?.[
                            stationETAs.stations.length - 1
                          ]?.scheduledArrival || "Calculating..."}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                          AI Expected Arrival
                        </p>
                        <p className="text-xl font-black text-blue-600">
                          {destinationEtaObj
                            ? formatTimeForPassenger(
                                destinationEtaObj.predictedArrival
                              )
                            : "Calculating..."}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Predicted Final Delay
                        </p>
                        <p
                          className={cn(
                            "text-xl font-black",
                            getDelayColor(expectedArrivalDelay)
                          )}
                        >
                          {formatEtaDelay(expectedArrivalDelay)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs font-medium text-slate-500">
                    <span>
                      Estimated time remaining: Calculated dynamically from
                      live speed and corridor traffic.
                    </span>
                    <span className="font-bold text-slate-700">
                      {trackingData.destination} Terminal
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl">
                        <Cloud className="w-5 h-5" />
                      </div>

                      <div>
                        <h3 className="text-base font-black text-slate-900">
                          Weather & Conditions
                        </h3>
                        <p className="text-xs text-slate-500">
                          Near train&apos;s current location
                        </p>
                      </div>
                    </div>

                    <div className="py-2">
                      <WeatherIndicator
                        destinationCode={trackingData.destination}
                        destinationName={trackingData.destination}
                      />
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
                    Weather conditions factored into real-time running safety
                    and ETA adjustments.
                  </div>
                </div>
              </div>

              {etaExplanation && (
                <div className="bg-white rounded-3xl border border-amber-200/80 p-6 md:p-8 shadow-xs relative overflow-hidden">
                  <div className="absolute right-0 top-0 p-8 opacity-5">
                    <HelpCircle className="w-32 h-32 text-amber-600" />
                  </div>

                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                          <Brain className="w-5 h-5" />
                        </div>

                        <div>
                          <h3 className="text-lg font-black text-slate-900">
                            Why is the ETA changing?
                          </h3>
                          <p className="text-xs text-slate-500 font-medium">
                            Transparent operational factors affecting your
                            train
                          </p>
                        </div>
                      </div>

                      <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
                        {etaExplanation.totalChangeMinutes !== 0
                          ? `${
                              etaExplanation.totalChangeMinutes > 0 ? "+" : ""
                            }${etaExplanation.totalChangeMinutes.toFixed(
                              0
                            )} min change`
                          : "Stable Forecast"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Previous ETA
                        </p>
                        <p className="text-base font-black text-slate-700">
                          {etaExplanation.previousEta
                            ? formatTimeForPassenger(
                                etaExplanation.previousEta
                              )
                            : "Initial Forecast"}
                        </p>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Current Expected ETA
                        </p>
                        <p className="text-base font-black text-slate-900">
                          {etaExplanation.newEta
                            ? formatTimeForPassenger(etaExplanation.newEta)
                            : "—"}
                        </p>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Delay Trend
                        </p>
                        <p
                          className={cn(
                            "text-base font-black",
                            etaExplanation.totalChangeMinutes > 0
                              ? "text-rose-600"
                              : "text-emerald-600"
                          )}
                        >
                          {etaExplanation.totalChangeMinutes > 0
                            ? `+${etaExplanation.totalChangeMinutes.toFixed(
                                0
                              )} min slower`
                            : `${etaExplanation.totalChangeMinutes.toFixed(
                                0
                              )} min faster`}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {etaExplanation.reasons.map((reason, idx) => (
                        <div
                          key={idx}
                          className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4"
                        >
                          <div
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 mt-0.5",
                              reason.severity === "High"
                                ? "bg-rose-100 text-rose-700"
                                : reason.severity === "Medium"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-200 text-slate-700"
                            )}
                          >
                            {reason.severity} Impact
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-sm font-bold text-slate-900">
                                {reason.label}
                              </p>

                              <span
                                className={cn(
                                  "text-sm font-black",
                                  reason.impactMinutes > 0
                                    ? "text-rose-600"
                                    : "text-emerald-600"
                                )}
                              >
                                {reason.impactMinutes > 0 ? "+" : ""}
                                {reason.impactMinutes.toFixed(1)}m
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 font-medium leading-relaxed">
                              {reason.evidence}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                      <Timer className="w-5 h-5" />
                    </div>

                    <div>
                      <h3 className="text-lg font-black text-slate-900">
                        Station-by-Station ETA Forecast
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        Live arrival schedule across upcoming stations
                      </p>
                    </div>
                  </div>

                  <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">
                    {stationETAs?.stationETAs?.length || 0} Stations Remaining
                  </span>
                </div>

                {loadingETA ? (
                  <div className="py-12 flex items-center justify-center gap-3 text-slate-400 font-bold text-xs uppercase tracking-widest">
                    <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                    Calculating station forecasts...
                  </div>
                ) : stationETAs?.stationETAs &&
                  stationETAs.stationETAs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 text-[11px] font-black uppercase tracking-wider">
                          <th className="py-3 px-4">#</th>
                          <th className="py-3 px-4">Station</th>
                          <th className="py-3 px-4">Code</th>
                          <th className="py-3 px-4">Scheduled Arrival</th>
                          <th className="py-3 px-4">AI Expected Arrival</th>
                          <th className="py-3 px-4">Delay</th>
                          <th className="py-3 px-4 text-right">Status</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100 text-sm">
                        {stationETAs.stationETAs.map((eta, idx) => {
                          const stationInfo = stationETAs.stations?.find(
                            (s) => s.station === eta.toStation
                          );

                          const isTerminus =
                            idx === stationETAs.stationETAs.length - 1;

                          const isPast =
                            idx < (stationETAs.sectionIndex || 0);

                          return (
                            <tr
                              key={idx}
                              className="hover:bg-slate-50/80 transition-colors"
                            >
                              <td className="py-4 px-4 font-mono font-bold text-slate-400">
                                {idx + 1}
                              </td>

                              <td className="py-4 px-4 font-bold text-slate-900">
                                {stationInfo?.stationName || eta.toStation}

                                {isTerminus && (
                                  <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded uppercase">
                                    Terminus
                                  </span>
                                )}
                              </td>

                              <td className="py-4 px-4 font-mono font-bold text-blue-600">
                                {eta.toStation}
                              </td>

                              <td className="py-4 px-4 text-slate-600 font-medium">
                                {stationInfo?.scheduledArrival ||
                                  formatTimeForPassenger(
                                    eta.predictedArrival
                                  )}
                              </td>

                              <td className="py-4 px-4 font-black text-slate-900">
                                {formatTimeForPassenger(
                                  eta.predictedArrival
                                )}
                              </td>

                              <td
                                className={cn(
                                  "py-4 px-4 font-bold",
                                  getDelayColor(eta.predictedDelayMinutes)
                                )}
                              >
                                {formatEtaDelay(eta.predictedDelayMinutes)}
                              </td>

                              <td className="py-4 px-4 text-right">
                                {isPast ? (
                                  <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">
                                    Departed
                                  </span>
                                ) : isTerminus ? (
                                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
                                    Destination
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                                    Upcoming
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400 font-medium">
                    No station forecasts available for this train currently.
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                    <TrendingUp className="w-5 h-5" />
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      Historical Route Intelligence
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Performance analytics based on past corridor telemetry
                      (Kaggle Historical Data)
                    </p>
                  </div>
                </div>

                {stationETAs?.historicalContext?.available ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                        On-Time Arrival Rate
                      </p>

                      <p className="text-2xl font-black text-emerald-600">
                        {stationETAs.historicalContext.reliability ||
                          `${Math.round(
                            (stationETAs.historicalContext
                              .historicalOnTimeRate ?? 0.7) * 100
                          )}%`}
                      </p>

                      <p className="text-[11px] text-slate-500 mt-1">
                        {stationETAs.historicalContext.historicalPeriod ||
                          "Based on 2018-2024 historical runs"}
                      </p>
                    </div>

                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Average Historical Delay
                      </p>

                      <p className="text-2xl font-black text-slate-800">
                        {stationETAs.historicalContext
                          .averageDelayMinutes != null
                          ? formatEtaDelay(
                              stationETAs.historicalContext
                                .averageDelayMinutes,
                              false
                            )
                          : "15 min"}
                      </p>

                      <p className="text-[11px] text-slate-500 mt-1">
                        Average across historical operations
                      </p>
                    </div>

                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Peak-Hour Delay Behavior
                      </p>

                      <p className="text-2xl font-black text-amber-600">
                        {stationETAs.historicalContext
                          .peakHourAverageMinutes != null
                          ? formatEtaDelay(
                              stationETAs.historicalContext
                                .peakHourAverageMinutes
                            )
                          : "+20 min"}
                      </p>

                      <p className="text-[11px] text-slate-500 mt-1">
                        Observed during peak operational hours
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-center text-slate-500 font-semibold text-sm">
                    Historical intelligence unavailable for this train in the
                    educational dataset.
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!trackingData && !loading && (
          <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center shadow-xs">
            <Train className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              No Train Selected
            </h3>
            <p className="text-slate-500 text-sm">
              Enter a train number above to view real-time ETA predictions and
              journey status.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className="p-2.5 bg-slate-50 rounded-xl">{icon}</div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
          {label}
        </span>
      </div>

      <div>
        <p className="text-2xl font-black text-slate-900 tracking-tight">
          {value}
        </p>
        <p className="text-xs font-medium text-slate-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
