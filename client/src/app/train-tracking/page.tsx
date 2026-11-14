"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import { API_URL } from "@/lib/constants";
import { useSocket } from "@/hooks/useSocket";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Train,
  MapPin,
  Clock,
  Navigation,
  Zap,
  Activity,
  CheckCircle,
  Cloud,
  Compass,
  ArrowRight,
  Search,
  WifiOff,
} from "lucide-react";
import { cn } from "@/utils/cn";
import BackButton from "@/components/BackButton";
import WeatherIndicator from "@/components/WeatherIndicator";
import { formatEtaDelay } from "@/utils/formatDuration";
import {
  calculateJourneyProgress,
  buildTimeline,
  buildLiveUpdate,
  formatMinutesShort,
  type RouteStationInfo,
  type RouteSegment,
  type JourneyState,
} from "@/utils/journeyProgress";

const LiveTrainMap = dynamic(() => import("@/components/LiveTrainMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] bg-slate-900 rounded-[2rem] flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest text-xs">
      Loading Geographic Live Map...
    </div>
  ),
});

interface TrainTrackingData {
  _id: string;
  trainNumber: string;
  name: string;
  source: string;
  destination: string;
  currentStation: string;
  previousStation?: string | null;
  currentLocation: { lat: number; lng: number };
  nextStation: string;
  distanceFromNext: number;
  estimatedArrival: string;
  status: "OnTime" | "Delayed" | "Cancelled";
  delay?: number;
  speed: number;
  progress?: number | null;
  journeyState?: string;
  sectionIndex?: number;
  progressInSection?: number;
  distanceTravelled?: number;
  totalDistance?: number;
  remainingDistance?: number;
  elapsedMinutes?: number | null;
  remainingMinutes?: number | null;
  departureTime?: string;
  arrivalTime?: string;
  heading?: number;
  routeStations?: RouteStationInfo[];
  routeSegments?: RouteSegment[];
  telemetrySource?: string;
  telemetryFreshness?: string;
  telemetryTimestamp?: string | null;
  isStale?: boolean;
  updatedAt?: string;
}

interface TelemetrySocketPayload {
  trainId?: string;
  trainNumber?: string;
  timestamp?: string;
  latitude?: number | null;
  longitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  currentStation?: string | null;
  nextStation?: string | null;
  sectionIndex?: number;
  progressInSection?: number;
  sectionDistance?: number | null;
  progress?: number | null;
  accumulatedDelay?: number;
  status?: string;
  source?: string;
  freshness?: string;
  isStale?: boolean;
  journeyState?: string;
  distanceTravelled?: number;
  totalDistance?: number;
  remainingDistance?: number;
  estimatedArrival?: string;
}

interface EtaSocketPayload {
  trainId?: string;
  trainNumber?: string;
  estimatedArrival?: string;
  destination?: {
    predictedArrival?: string;
    predictedDelayMinutes?: number;
  };
}

interface FetchError {
  response?: { status?: number; data?: { message?: string } };
}

const isFetchError = (err: unknown): err is FetchError =>
  typeof err === "object" && err !== null && "response" in err;

const STALE_AFTER_MS = 30000;

export default function TrainTrackerPage() {
  const { token } = useAuth();
  const { socket, trackTrain, stopTracking } = useSocket();
  const [trainNumber, setTrainNumber] = useState("");
  const [trackingData, setTrackingData] = useState<TrainTrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const trackedIdRef = useRef<string | null>(null);

  const fetchTrainTracking = async (number: string) => {
    const cleanNum = (number || "").trim().toUpperCase();
    if (!cleanNum) {
      toast.error("Please enter a valid train number");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/trains/${cleanNum}/tracking`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const data = response.data as TrainTrackingData;
      setTrackingData(data);
      setLastUpdatedAt(new Date());

      if (data._id) {
        if (trackedIdRef.current && trackedIdRef.current !== data._id) {
          stopTracking(trackedIdRef.current);
        }
        trackedIdRef.current = data._id;
        trackTrain(data._id);
      }
    } catch (error) {
      const fallback = `Train ${cleanNum} is currently unavailable.`;
      const errMsg = isFetchError(error)
        ? error.response?.status === 404 || error.response?.data?.message === "Train not found"
          ? fallback
          : error.response?.data?.message || fallback
        : fallback;
      toast.error(errMsg);
      setTrackingData(null);
      setLastUpdatedAt(null);
    } finally {
      setLoading(false);
    }
  };

  // Live telemetry updates via Socket.io — single mutation path for all UI state
  useEffect(() => {
    if (!socket || !trackingData?._id) return;
    const trainId = trackingData._id;
    const trainNumberId = trackingData.trainNumber;

    const handleTelemetry = (data: TelemetrySocketPayload) => {
      const isOtherTrain =
        (data.trainId && data.trainId !== trainId) ||
        (!data.trainId && data.trainNumber && data.trainNumber !== trainNumberId);
      if (isOtherTrain) {
        return;
      }

      setTrackingData((prev) => {
        if (!prev) return prev;

        const sectionIndex =
          data.sectionIndex != null ? Number(data.sectionIndex) : prev.sectionIndex ?? 0;
        const progressInSection =
          data.progressInSection != null
            ? Number(data.progressInSection)
            : prev.progressInSection ?? 0;

        // Server may send progress; always keep last known non-null value (never reset to 0)
        let progress = prev.progress;
        if (data.progress != null && Number.isFinite(Number(data.progress))) {
          progress = Math.min(100, Math.max(0, Number(data.progress)));
        }

        const sectionDistance =
          data.sectionDistance != null && Number.isFinite(Number(data.sectionDistance))
            ? Number(data.sectionDistance)
            : null;
        const distanceFromNext =
          sectionDistance != null && progressInSection != null
            ? Math.max(0, Math.round(sectionDistance - progressInSection))
            : prev.distanceFromNext;

        return {
          ...prev,
          currentStation: data.currentStation || prev.currentStation,
          currentLocation: {
            lat: data.latitude ?? prev.currentLocation.lat,
            lng: data.longitude ?? prev.currentLocation.lng,
          },
          nextStation: data.nextStation || prev.nextStation,
          distanceFromNext,
          estimatedArrival: data.estimatedArrival ?? prev.estimatedArrival,
          status: (data.status || prev.status) as TrainTrackingData["status"],
          delay: data.accumulatedDelay ?? prev.delay,
          speed: data.speed ?? prev.speed,
          heading: data.heading ?? prev.heading,
          progress,
          sectionIndex,
          progressInSection,
          journeyState: data.journeyState ?? prev.journeyState,
          distanceTravelled: data.distanceTravelled ?? prev.distanceTravelled,
          totalDistance: data.totalDistance ?? prev.totalDistance,
          remainingDistance: data.remainingDistance ?? prev.remainingDistance,
          telemetrySource: data.source || prev.telemetrySource,
          telemetryFreshness: data.freshness || prev.telemetryFreshness,
          telemetryTimestamp: data.timestamp || prev.telemetryTimestamp,
          isStale: data.isStale ?? prev.isStale,
        };
      });
      setLastUpdatedAt(new Date());
    };

    const handleETAUpdate = (data: EtaSocketPayload) => {
      if (data.trainId && data.trainId !== trainId && data.trainNumber !== trainNumberId) {
        return;
      }
      if (data.trainNumber && data.trainNumber !== trainNumberId && !data.trainId) {
        return;
      }

      setTrackingData((prev) => {
        if (!prev) return prev;
        const nextEta =
          data.destination?.predictedArrival ||
          data.estimatedArrival ||
          prev.estimatedArrival;
        // Current running delay stays authoritative from telemetry;
        // only fill from ETA payload when telemetry delay is absent.
        const etaDelay = data.destination?.predictedDelayMinutes;
        const delay =
          prev.delay != null && prev.delay !== 0
            ? prev.delay
            : etaDelay != null
              ? etaDelay
              : prev.delay;
        return {
          ...prev,
          estimatedArrival: nextEta || prev.estimatedArrival,
          delay,
        };
      });
      setLastUpdatedAt(new Date());
    };

    socket.on("train:update", handleTelemetry);
    socket.on("train:telemetry", handleTelemetry);
    socket.on("train:eta:update", handleETAUpdate);

    return () => {
      socket.off("train:update", handleTelemetry);
      socket.off("train:telemetry", handleTelemetry);
      socket.off("train:eta:update", handleETAUpdate);
    };
  }, [socket, trackingData?._id, trackingData?.trainNumber]);

  // Leave train room only when switching trains or unmounting
  useEffect(() => {
    return () => {
      if (trackedIdRef.current) {
        stopTracking(trackedIdRef.current);
        trackedIdRef.current = null;
      }
    };
  }, [stopTracking]);

  // Clock for "updated X ago" — no aggressive polling of APIs
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const stationNames = useMemo(() => {
    const map: Record<string, string> = {};
    trackingData?.routeStations?.forEach((s) => {
      map[s.code] = s.name || s.code;
    });
    return map;
  }, [trackingData?.routeStations]);

  const getStationName = useCallback(
    (code: string | null | undefined) => (code ? stationNames[code] || code : "—"),
    [stationNames]
  );

  /** Single derived journey state — map, timeline, progress, live card all use this. */
  const journey: JourneyState | null = useMemo(() => {
    if (!trackingData) return null;
    return calculateJourneyProgress({
      routeStations: trackingData.routeStations || [],
      routeSegments: trackingData.routeSegments || [],
      sectionIndex: trackingData.sectionIndex ?? 0,
      progressInSection: trackingData.progressInSection ?? 0,
      currentStation: trackingData.currentStation,
      nextStation: trackingData.nextStation,
      source: trackingData.source,
      destination: trackingData.destination,
      speed: trackingData.speed ?? 0,
      delayMinutes: trackingData.delay ?? 0,
      serverProgress: trackingData.progress ?? null,
      departureTime: trackingData.departureTime ?? null,
      arrivalTime: trackingData.arrivalTime ?? null,
    });
  }, [trackingData]);

  const timeline = useMemo(() => {
    if (!trackingData?.routeStations || !journey) return [];
    return buildTimeline(trackingData.routeStations, journey);
  }, [trackingData?.routeStations, journey]);

  const isStale = useMemo(() => {
    if (trackingData?.isStale) return true;
    if (!lastUpdatedAt) return false;
    return nowTick - lastUpdatedAt.getTime() > STALE_AFTER_MS;
  }, [trackingData?.isStale, lastUpdatedAt, nowTick]);

  const lastUpdatedSecondsAgo = useMemo(() => {
    if (!lastUpdatedAt) return null;
    return Math.max(0, Math.floor((nowTick - lastUpdatedAt.getTime()) / 1000));
  }, [lastUpdatedAt, nowTick]);

  const liveUpdate = useMemo(() => {
    if (!journey) return null;
    return buildLiveUpdate(journey, stationNames, {
      estimatedArrival: trackingData?.estimatedArrival ?? null,
      lastUpdatedSecondsAgo: lastUpdatedSecondsAgo ?? undefined,
      isStale,
    });
  }, [journey, stationNames, trackingData?.estimatedArrival, lastUpdatedSecondsAgo, isStale]);

  const getStatusText = (status: string, delay?: number) => {
    if (status === "Cancelled") return "Train is cancelled";
    if (delay && delay > 0) return `Delayed by ${formatEtaDelay(delay)}`;
    if (status === "Delayed") return "Train is delayed";
    return "On time & operating normally";
  };

  const getSpeedDisplay = () => {
    if (isStale) return "Speed unavailable";
    if (trackingData?.speed == null || trackingData.speed < 1) return "En Route / Active";
    return `${Math.round(trackingData.speed)} km/h`;
  };

  const getDistanceDisplay = () => {
    if (!trackingData || !journey) return "0 km";
    if (journey.status === "COMPLETED") return "Arrived";
    const dist = Math.max(0, trackingData.distanceFromNext || journey.distanceToNext || 0);
    if (dist === 0) return "Arrived";
    return `${dist} km ahead`;
  };

  const getCurrentLocationDisplay = () => journey?.currentLocationLabel || "Loading...";

  const progressValue = journey?.percentage ?? null;

  const upcomingStops = useMemo(() => {
    if (!trackingData?.routeStations || !journey?.currentStation) return [];
    const curIdx = trackingData.routeStations.findIndex(
      (s) => s.code === journey.currentStation
    );
    return trackingData.routeStations.filter((_, idx) => idx > curIdx);
  }, [trackingData?.routeStations, journey?.currentStation]);

  const formatClock = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  };

  const progressPct = progressValue ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <BackButton />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
            <Navigation className="w-4 h-4 text-blue-600 animate-pulse" />
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-widest">Live Passenger Tracking</span>
          </div>
        </div>

        {/* Search Bar */}
        <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 md:p-8">
          <h1 className="text-2xl font-black text-slate-800 mb-1">Where is my train?</h1>
          <p className="text-slate-500 text-sm font-medium mb-6">Enter train number (e.g. 11020, 12951) for real-time geographic tracking.</p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Train Number</label>
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5" />
                  <input
                    type="text"
                    value={trainNumber}
                    onChange={(e) => setTrainNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. 12951"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 pl-14 pr-6 text-lg font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-300"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") fetchTrainTracking(trainNumber);
                    }}
                  />
              </div>
            </div>
            <button
              onClick={() => fetchTrainTracking(trainNumber)}
              disabled={loading}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 active:scale-95"
            >
              {loading ? "Locating..." : "Track Train"}
            </button>
          </div>
        </section>

        {/* Tracking Results */}
        <AnimatePresence>
          {trackingData && journey && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {isStale && (
                <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-bold">
                  <WifiOff className="w-4 h-4 shrink-0" />
                  Live update unavailable — showing last known position
                  {lastUpdatedAt && (
                    <span className="font-mono text-xs text-amber-600">
                      (updated {formatClock(lastUpdatedAt.toISOString())})
                    </span>
                  )}
                </div>
              )}

              {/* HEADER SECTION */}
              <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-[2rem] p-8 shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-mono font-bold bg-blue-600/40 text-blue-300 px-3 py-1 rounded-full border border-blue-400/30">
                        {trackingData.trainNumber}
                      </span>
                      <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-500/20 text-green-300 border border-green-500/30 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
                        ● LIVE GPS ACTIVE
                      </div>
                    </div>
                    <h2 className="text-3xl font-black tracking-tight">{trackingData.name}</h2>
                    <p className="text-slate-300 text-sm font-medium mt-1 flex items-center gap-2">
                      <span className="font-bold text-white">{getStationName(trackingData.source)}</span>
                      <ArrowRight className="w-4 h-4 text-blue-400" />
                      <span className="font-bold text-white">{getStationName(trackingData.destination)}</span>
                    </p>
                  </div>

                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 text-right md:min-w-[240px]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-1">Status</p>
                    <p className="text-lg font-black text-white">{getStatusText(trackingData.status, trackingData.delay)}</p>
                    {trackingData.delay != null && trackingData.delay > 0 && (
                      <p className="text-xs font-bold text-amber-400 mt-1">
                        Delay: {formatEtaDelay(trackingData.delay)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* SUMMARY CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                      <Zap className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Speed</span>
                  </div>
                  <p className="text-3xl font-black text-slate-800 tracking-tight">
                    {getSpeedDisplay()}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">GPS Calibrated</p>
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Location</span>
                  </div>
                  <p className="text-xl font-black text-slate-800 tracking-tight truncate">
                    {getCurrentLocationDisplay()}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">
                    {isStale ? "Location update delayed" : "Real-time synced"}
                  </p>
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
                      <Navigation className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Next Station</span>
                  </div>
                  <div>
                    <p className="text-xl font-black text-slate-800 tracking-tight truncate">
                      {getStationName(journey.nextStation || trackingData.nextStation)}
                    </p>
                    <p className="text-[10px] font-mono font-bold text-amber-600 uppercase mt-0.5">
                      {journey.nextStation || trackingData.nextStation}
                    </p>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">
                    {getDistanceDisplay()}
                  </p>
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-purple-50 rounded-2xl text-purple-600">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Destination</span>
                  </div>
                  <p className="text-xl font-black text-slate-800 tracking-tight truncate">
                    {getStationName(trackingData.destination)}
                  </p>
                  <p className="text-[10px] font-mono font-bold text-purple-600 uppercase mt-0.5">{trackingData.destination}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">
                    Expected: {formatClock(trackingData.estimatedArrival)}
                  </p>
                </div>
              </div>

              {/* MAIN CONTENT: LEFT / LARGE REAL GEOGRAPHIC MAP, RIGHT: JOURNEY PROGRESS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                      <Compass className="w-5 h-5 text-blue-600" />
                      {trackingData.name || 'Route'} Map
                    </h3>
                    <div className="flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-100 rounded-full">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold text-green-700 uppercase tracking-widest">OpenStreetMap Live</span>
                    </div>
                  </div>

                  <LiveTrainMap
                    stations={trackingData.routeStations || []}
                    segments={trackingData.routeSegments || []}
                    currentLat={trackingData.currentLocation.lat}
                    currentLng={trackingData.currentLocation.lng}
                    currentStation={journey.currentStation || trackingData.currentStation}
                    nextStation={journey.nextStation || trackingData.nextStation}
                    source={trackingData.source}
                    destination={trackingData.destination}
                    heading={trackingData.heading || 0}
                    trainNumber={trackingData.trainNumber}
                    speed={trackingData.speed || 0}
                    delay={trackingData.delay || 0}
                    progress={journey.percentage}
                    status={journey.status}
                    stationETAs={[]}
                  />
                </div>

                {/* Right: Journey Progress — dense railway-style summary, no blank gap */}
                <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm flex flex-col gap-5">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight mb-3 flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-600" />
                      Journey Progress
                    </h3>
                    <p className="text-4xl font-black text-blue-600 mb-1 tracking-tight">
                      {progressValue !== null ? `${progressValue}%` : "—"}
                      <span className="text-sm font-bold text-slate-400 ml-2">completed</span>
                    </p>
                    <div className="w-full bg-slate-100 rounded-full h-4 relative overflow-hidden mt-4">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full"
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-blue-700 border-2 border-white rounded-full shadow-md"
                        style={{ left: `calc(${Math.min(98, Math.max(2, progressPct))}% - 10px)` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
                      <span>{journey.distanceTravelled} km done</span>
                      <span>{journey.totalDistance} km total</span>
                    </div>
                  </div>

                  <div className="space-y-0 rounded-2xl border border-slate-100 overflow-hidden">
                    {[
                      {
                        label: "Departed",
                        value: getStationName(journey.source || trackingData.source),
                        sub: trackingData.departureTime || null,
                        color: "text-slate-800",
                        dot: "bg-slate-400",
                      },
                      {
                        label: "Current",
                        value: journey.currentLocationLabel,
                        sub: journey.sectionLabel,
                        color: "text-blue-600",
                        dot: "bg-blue-600",
                      },
                      {
                        label: "Next Stop",
                        value: getStationName(journey.nextStation),
                        sub: journey.nextStation,
                        color: "text-amber-600",
                        dot: "bg-amber-500",
                      },
                      {
                        label: "Destination",
                        value: getStationName(journey.destination),
                        sub: journey.destination,
                        color: "text-purple-600",
                        dot: "bg-purple-500",
                      },
                    ].map((row, i, arr) => (
                      <div
                        key={row.label}
                        className={cn(
                          "flex items-start gap-3 px-4 py-3",
                          i < arr.length - 1 && "border-b border-dashed border-slate-100"
                        )}
                      >
                        <div className="flex flex-col items-center pt-1.5 w-3">
                          <span className={cn("w-2.5 h-2.5 rounded-full", row.dot)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{row.label}</p>
                          <p className={cn("text-sm font-black truncate", row.color)}>{row.value}</p>
                          {row.sub && (
                            <p className="text-[10px] font-mono font-bold text-slate-400 truncate">{row.sub}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Distance</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">
                        {journey.distanceTravelled} / {journey.totalDistance} km
                      </p>
                      <p className="text-[10px] font-bold text-slate-500">
                        {journey.remainingDistance} km remaining
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Speed</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">
                        {isStale ? "—" : journey.speed > 0 ? `${Math.round(journey.speed)} km/h` : "Stopped"}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500">{journey.status.replace(/_/g, " ").toLowerCase()}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Journey Time</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">
                        {formatMinutesShort(journey.distanceTravelled > 0 && trackingData.speed
                          ? (journey.distanceTravelled / Math.max(trackingData.speed, 1)) * 60
                          : trackingData.elapsedMinutes ?? null)}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500">
                        ~{formatMinutesShort(
                          journey.remainingDistance > 0 && journey.speed > 0
                            ? (journey.remainingDistance / journey.speed) * 60
                            : trackingData.remainingMinutes ?? null
                        )} left
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Delay / ETA</p>
                      <p className={cn(
                        "text-sm font-black mt-0.5",
                        journey.delayMinutes > 0 ? "text-amber-600" : "text-emerald-600"
                      )}>
                        {journey.delayMinutes > 0 ? `+${journey.delayMinutes} min` : "On time"}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500">
                        ETA {formatClock(trackingData.estimatedArrival)}
                      </p>
                    </div>
                  </div>

                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-1 border-t border-slate-100">
                    Updated{" "}
                    {lastUpdatedSecondsAgo != null
                      ? lastUpdatedSecondsAgo < 5
                        ? "just now"
                        : `${lastUpdatedSecondsAgo}s ago`
                      : "—"}
                    {trackingData.telemetrySource ? ` · ${trackingData.telemetrySource}` : ""}
                  </p>
                </div>
              </div>

              {/* SECOND SECTION: LEFT / LARGE LIVE JOURNEY TIMELINE, RIGHT: WHAT'S HAPPENING NOW */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left / Large: Live Journey Timeline */}
                <div className="lg:col-span-2 bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                  <h3 className="text-xl font-black text-slate-800 tracking-tight mb-6 flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-blue-600" />
                    Live Journey Timeline
                  </h3>
                  <div className="space-y-2">
                    {timeline.map((st) => {
                      let statusBadge = "○ Upcoming";
                      let badgeColor = "bg-slate-100 text-slate-500 border-slate-200";
                      let isCurrentHere = false;
                      let dotClass = "bg-slate-300";

                      switch (st.status) {
                        case "COMPLETED":
                          statusBadge = "✓ Completed / Departed";
                          badgeColor = "bg-green-50 text-green-700 border-green-200";
                          dotClass = "bg-green-500";
                          break;
                        case "CURRENT":
                          statusBadge = "● Current";
                          badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                          dotClass = "bg-blue-600 animate-ping";
                          isCurrentHere = true;
                          break;
                        case "NEXT":
                          statusBadge = "→ Next Stop";
                          badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                          dotClass = "bg-amber-500";
                          break;
                        case "DESTINATION":
                          statusBadge = "○ Destination";
                          badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
                          dotClass = "bg-purple-500";
                          break;
                        default:
                          statusBadge = "○ Upcoming";
                          badgeColor = "bg-slate-50 text-slate-500 border-slate-200";
                          dotClass = "bg-slate-300";
                      }

                      if (st.delayMinutes > 0 && st.status !== "COMPLETED") {
                        statusBadge = `⚠ ${formatEtaDelay(st.delayMinutes)}`;
                        badgeColor = "bg-amber-50 text-amber-800 border-amber-300";
                      }

                      return (
                        <div
                          key={st.code}
                          className={cn(
                            "p-4 rounded-2xl border transition-all",
                            isCurrentHere
                              ? "bg-blue-50/60 border-blue-200 shadow-sm"
                              : "bg-white border-slate-100 hover:bg-slate-50"
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-4 min-w-0">
                              <div className={cn("w-3 h-3 rounded-full shrink-0", dotClass)} />
                              <div className="min-w-0">
                                <p className="font-black text-slate-800 uppercase text-base truncate">{st.name}</p>
                                <p className="text-[10px] font-mono font-bold text-slate-400">{st.code}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 justify-end">
                              <div className="text-right hidden sm:block">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sched. Arr</p>
                                <p className="text-xs font-mono font-bold text-slate-600">
                                  {st.scheduledArrival || (st.index === 0 ? "Origin" : "—")}
                                </p>
                              </div>
                              <div className="text-right hidden sm:block">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sched. Dep</p>
                                <p className="text-xs font-mono font-bold text-slate-600">
                                  {st.scheduledDeparture || (st.index === timeline.length - 1 ? "Terminus" : "—")}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                  badgeColor
                                )}
                              >
                                {statusBadge}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: What's Happening Now */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-[2rem] border border-blue-100 p-8 shadow-sm flex flex-col justify-between gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-600" />
                        Live Update
                      </h3>
                      <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest px-2 py-1 rounded-full bg-blue-100 border border-blue-200">
                        What&apos;s Happening Now
                      </span>
                    </div>

                    <p className="text-slate-700 text-base font-bold leading-relaxed mb-5">
                      {liveUpdate?.headline}
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      {(liveUpdate?.lines || []).map((line) => (
                        <div
                          key={line.label}
                          className="rounded-2xl bg-white/70 border border-blue-100 px-3 py-2.5"
                        >
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            {line.label}
                          </p>
                          <p className="text-sm font-black text-slate-800 truncate">{line.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-4 border-t border-blue-200/50">
                    Derived from real-time telemetry and operational tracking
                  </p>
                </div>
              </div>

              {/* UPCOMING STOPS TABLE */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                <h3 className="text-xl font-black text-slate-800 tracking-tight mb-6 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  Upcoming Stops & Expected Arrivals
                </h3>
                {upcomingStops.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-sm font-medium">
                    Train has reached or passed all intermediate stops.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <th className="py-4 px-4">Station</th>
                          <th className="py-4 px-4">Code</th>
                          <th className="py-4 px-4">Expected Arrival</th>
                          <th className="py-4 px-4">Delay Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-sm font-bold text-slate-700">
                        {upcomingStops.map((stop, idx) => {
                          const delayMin = Math.round(trackingData.delay || journey.delayMinutes || 0);

                          return (
                            <tr key={`${stop.code}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-4 px-4 font-black text-slate-800 uppercase">
                                {stop.name}
                              </td>
                              <td className="py-4 px-4 font-mono text-slate-400">
                                {stop.code}
                              </td>
                              <td className="py-4 px-4 font-mono text-slate-800">
                                {stop.scheduledArrival ? stop.scheduledArrival : "Calculating"}
                              </td>
                              <td className="py-4 px-4">
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                                  delayMin > 0 ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-green-50 text-green-700 border border-green-100"
                                )}>
                                  {delayMin > 0 ? formatEtaDelay(delayMin) : "On Time"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* BOTTOM: WEATHER & OPERATIONAL ANALYSIS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                      <Cloud className="w-5 h-5 text-sky-500" />
                      Current Weather
                    </h3>
                    <WeatherIndicator
                      latitude={trackingData.currentLocation.lat}
                      longitude={trackingData.currentLocation.lng}
                      destinationCode={trackingData.destination}
                      destinationName={trackingData.destination}
                    />
                  </div>
                  <p className="text-slate-500 text-sm font-medium mb-4">
                    Weather conditions near your train&apos;s current position at {getStationName(journey.currentStation || trackingData.currentStation)}.
                  </p>
                  <div className="p-4 bg-sky-50/50 rounded-2xl border border-sky-100 flex items-center gap-4">
                    <div className="p-3 bg-sky-100 rounded-xl text-sky-600">
                      <Cloud className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-sky-900 uppercase tracking-widest">Train Corridor Weather</p>
                      <p className="text-xs text-sky-700 mt-0.5">Live Open-Meteo telemetry synced for safe journey tracking.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                  <h3 className="text-xl font-black text-slate-800 tracking-tight mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-600" />
                    Operational Analysis
                  </h3>
                    <p className="text-slate-600 text-sm font-medium leading-relaxed mb-4">
                      {trackingData.name || "This train"} is at {journey.percentage}% journey completion on section {journey.sectionLabel}, moving at {Math.round(journey.speed || 0)} km/h with {journey.delayMinutes > 0 ? `${journey.delayMinutes} min delay` : "no delay"} against live GPS telemetry.
                    </p>
                  <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                    <span className="text-xs font-bold text-blue-900">Live GPS Telemetry Active (Train {trackingData.trainNumber})</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!trackingData && !loading && (
          <div className="py-24 text-center">
            <Train className="w-20 h-20 text-slate-200 mx-auto mb-4 animate-bounce" />
            <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-xs">Enter a train number above to start tracking</p>
          </div>
        )}
      </div>
    </div>
  );
}
