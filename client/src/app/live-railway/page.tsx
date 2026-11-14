"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import { API_URL } from "@/lib/constants";
import { useSocket } from "@/hooks/useSocket";
import { motion } from "framer-motion";
import BackButton from "@/components/BackButton";
import {
  Train,
  MapPin,
  Navigation,
  Wifi,
  WifiOff,
  Activity,
  ChevronRight,
  Search,
  Eye,
  Layers,
  Cloud,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface StationData {
  code: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  zone?: string;
  stationType?: string;
}

interface TrainData {
  _id: string;
  trainNumber: string;
  name: string;
  source: string;
  destination: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  currentStation: string;
  nextStation: string;
  sectionIndex: number;
  progressInSection: number;
  delay: number;
  status: string;
  sourceLabel: string;
  freshness: string;
  isStale: boolean;
  timestamp: string;
  trainDelayMinutes?: number;
}

interface RouteSegment {
  fromStation: string;
  toStation: string;
  distance: number;
  typicalSpeed: number;
  maxSpeed: number;
  sectionType: string;
  from: { lat: number; lng: number; name: string };
  to: { lat: number; lng: number; name: string };
}

interface RouteGeometry {
  routeCode: string;
  name: string;
  segments: RouteSegment[];
}

interface CongestionSection {
  fromStation: string;
  toStation: string;
  status: "NORMAL" | "CONGESTED" | "SEVERE";
  eventType?: string;
  speedLimit?: number;
  severity?: number;
  trainCount?: number;
}

interface GISOverview {
  success: boolean;
  stations: StationData[];
  trains: TrainData[];
  routes: RouteGeometry[];
  congestion: CongestionSection[];
  activeSource: string;
  sourceLabel: string;
  timestamp: string;
}

interface TelemetryPayload {
  trainId: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  currentStation: string;
  nextStation: string;
  accumulatedDelay?: number;
  status?: string;
  freshness?: string;
  isStale?: boolean;
  timestamp: string;
  source?: string;
  sourceLabel?: string;
}

function formatTimeAgo(ts: string | null): string {
  if (!ts) return "N/A";

  const diff = Date.now() - new Date(ts).getTime();
  const secs = Math.floor(diff / 1000);

  if (secs < 10) return "Just now";
  if (secs < 60) return `${secs}s ago`;

  const mins = Math.floor(secs / 60);

  if (mins < 60) return `${mins}m ago`;

  return `${Math.floor(mins / 60)}h ago`;
}

function getStationTypeIcon(type?: string): string {
  switch (type) {
    case "Junction":
      return "🔗";
    case "Terminal":
      return "🏁";
    case "Halt":
      return "⏸";
    case "Crossing":
      return "⚖";
    default:
      return "🚉";
  }
}

function RailwayMap({
  stations,
  trains,
  routes,
  congestion,
  selectedTrain,
  onTrainSelect,
  passengerMode,
}: {
  stations: StationData[];
  trains: TrainData[];
  routes: RouteGeometry[];
  congestion: CongestionSection[];
  selectedTrain: TrainData | null;
  onTrainSelect: (t: TrainData) => void;
  passengerMode: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredStation, setHoveredStation] = useState<StationData | null>(null);

  const bounds = {
    minLat: 6,
    maxLat: 38,
    minLng: 68,
    maxLng: 98,
  };

  const mapWidth = 1200;
  const mapHeight = 700;
  const padding = 40;

  const project = (
    lat: number,
    lng: number
  ): { x: number; y: number } => {
    const x =
      padding +
      ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) *
        (mapWidth - 2 * padding);

    const y =
      padding +
      ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) *
        (mapHeight - 2 * padding);

    return { x, y };
  };

  const getCongestionColor = (
    fromStation: string,
    toStation: string
  ): string => {
    const section = congestion.find(
      (c) =>
        c.fromStation === fromStation && c.toStation === toStation
    );

    if (!section) return "#94a3b8";

    switch (section.status) {
      case "SEVERE":
        return "#ef4444";
      case "CONGESTED":
        return "#f59e0b";
      default:
        return "#22c55e";
    }
  };

  const getTrainColor = (train: TrainData): string => {
    if (train.isStale) return "#94a3b8";
    if (train.status === "Delayed") return "#f59e0b";
    return "#2563eb";
  };

  const getTrainPulseColor = (train: TrainData): string => {
    if (train.isStale) return "rgba(148, 163, 184, 0.2)";
    if (train.status === "Delayed") return "rgba(245, 158, 11, 0.2)";
    return "rgba(37, 99, 235, 0.2)";
  };

  return (
    <div className="relative w-full bg-slate-50 rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        className="w-full h-auto"
        style={{ minHeight: 400 }}
      >
        <defs>
          <pattern
            id="grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>

        <rect width={mapWidth} height={mapHeight} fill="#f8fafc" />
        <rect
          width={mapWidth}
          height={mapHeight}
          fill="url(#grid)"
        />

        {routes.map((route) =>
          route.segments.map((seg, idx) => {
            const from = project(seg.from.lat, seg.from.lng);
            const to = project(seg.to.lat, seg.to.lng);
            const color = getCongestionColor(
              seg.fromStation,
              seg.toStation
            );

            return (
              <g key={`${route.routeCode}-${idx}`}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={color}
                  strokeWidth={passengerMode ? 2.5 : 1.5}
                  strokeOpacity={0.7}
                  strokeLinecap="round"
                />
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="white"
                  strokeWidth={passengerMode ? 1 : 0.5}
                  strokeOpacity={0.4}
                  strokeDasharray="4 4"
                />
              </g>
            );
          })
        )}

        {stations.map((station) => {
          const pos = project(
            station.latitude,
            station.longitude
          );

          const isEndpoint = trains.some(
            (t) =>
              t.source === station.code ||
              t.destination === station.code
          );

          const isCurrent = trains.some(
            (t) => t.currentStation === station.code
          );

          const isNext = trains.some(
            (t) => t.nextStation === station.code
          );

          const radius = isEndpoint
            ? 5
            : isCurrent || isNext
              ? 4.5
              : 3;

          return (
            <g
              key={station.code}
              onMouseEnter={() => setHoveredStation(station)}
              onMouseLeave={() => setHoveredStation(null)}
              className="cursor-pointer"
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius + 2}
                fill="transparent"
              />

              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius}
                fill={
                  isCurrent
                    ? "#2563eb"
                    : isNext
                      ? "#3b82f6"
                      : isEndpoint
                        ? "#1e293b"
                        : "#64748b"
                }
                stroke="white"
                strokeWidth={1.5}
              />

              {isEndpoint && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={radius + 4}
                  fill="none"
                  stroke={isCurrent ? "#2563eb" : "#1e293b"}
                  strokeWidth={1}
                  strokeOpacity={0.3}
                />
              )}

              {station.stationType === "Junction" && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={8}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth={0.5}
                  strokeDasharray="2 2"
                />
              )}

              <text
                x={pos.x}
                y={pos.y - radius - 5}
                textAnchor="middle"
                fill="#334155"
                fontSize={passengerMode && isEndpoint ? "11" : "8"}
                fontWeight={isEndpoint ? "bold" : "normal"}
                fontFamily="system-ui, sans-serif"
              >
                {station.code}
              </text>
            </g>
          );
        })}

        {trains.map((train) => {
          const pos = project(train.latitude, train.longitude);
          const isSelected = selectedTrain?._id === train._id;
          const color = getTrainColor(train);
          const pulseColor = getTrainPulseColor(train);

          const angle = (train.heading * Math.PI) / 180;
          const arrowLen = 12;
          const arrowWidth = 5;

          const tipX = pos.x + Math.cos(angle) * arrowLen;
          const tipY = pos.y - Math.sin(angle) * arrowLen;

          const leftX =
            pos.x + Math.cos(angle + 2.5) * arrowWidth;
          const leftY =
            pos.y - Math.sin(angle + 2.5) * arrowWidth;

          const rightX =
            pos.x + Math.cos(angle - 2.5) * arrowWidth;
          const rightY =
            pos.y - Math.sin(angle - 2.5) * arrowWidth;

          return (
            <g
              key={train._id}
              onClick={() => onTrainSelect(train)}
              className="cursor-pointer"
            >
              {!train.isStale && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={20}
                  fill={pulseColor}
                >
                  <animate
                    attributeName="r"
                    values="12;22;12"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.6;0;0.6"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              <polygon
                points={`${tipX},${tipY} ${leftX},${leftY} ${pos.x},${pos.y} ${rightX},${rightY}`}
                fill={color}
                stroke="white"
                strokeWidth={1.5}
                opacity={train.isStale ? 0.5 : 1}
              />

              {isSelected && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={18}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from={`0 ${pos.x} ${pos.y}`}
                    to={`360 ${pos.x} ${pos.y}`}
                    dur="4s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              <rect
                x={pos.x - 22}
                y={pos.y + 14}
                width={44}
                height={14}
                rx={3}
                fill={color}
                opacity={0.9}
              />

              <text
                x={pos.x}
                y={pos.y + 24}
                textAnchor="middle"
                fill="white"
                fontSize="8"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {train.trainNumber}
              </text>
            </g>
          );
        })}

        {hoveredStation && (
          <g>
            <rect
              x={
                project(
                  hoveredStation.latitude,
                  hoveredStation.longitude
                ).x + 10
              }
              y={
                project(
                  hoveredStation.latitude,
                  hoveredStation.longitude
                ).y - 40
              }
              width={180}
              height={48}
              rx={6}
              fill="#1e293b"
              fillOpacity={0.95}
            />

            <text
              x={
                project(
                  hoveredStation.latitude,
                  hoveredStation.longitude
                ).x + 18
              }
              y={
                project(
                  hoveredStation.latitude,
                  hoveredStation.longitude
                ).y - 22
              }
              fill="white"
              fontSize="10"
              fontWeight="bold"
              fontFamily="system-ui, sans-serif"
            >
              {hoveredStation.name} ({hoveredStation.code})
            </text>

            <text
              x={
                project(
                  hoveredStation.latitude,
                  hoveredStation.longitude
                ).x + 18
              }
              y={
                project(
                  hoveredStation.latitude,
                  hoveredStation.longitude
                ).y - 8
              }
              fill="#94a3b8"
              fontSize="8"
              fontFamily="system-ui, sans-serif"
            >
              {hoveredStation.city}, {hoveredStation.state} |{" "}
              {getStationTypeIcon(hoveredStation.stationType)}{" "}
              {hoveredStation.stationType || "Halt"}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function PassengerPanel({ train }: { train: TrainData }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden"
    >
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-blue-200 uppercase tracking-[0.3em]">
              Where is my train?
            </p>
            <h3 className="text-2xl font-black text-white mt-1">
              {train.trainNumber}
            </h3>
            <p className="text-blue-100 text-sm font-medium">
              {train.name}
            </p>
          </div>

          <div className="text-right">
            <div
              className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                train.isStale
                  ? "bg-slate-500/30 text-slate-100"
                  : train.status === "Delayed"
                    ? "bg-amber-400/20 text-amber-100"
                    : "bg-green-400/20 text-green-100"
              )}
            >
              {train.isStale
                ? "SIGNAL LOST"
                : train.status === "Delayed"
                  ? `DELAYED +${Math.round(train.delay)}M`
                  : "ON TIME"}
            </div>

            {train.source === "SIMULATOR" && (
              <p className="text-[8px] text-blue-200 mt-1 uppercase tracking-widest">
                Simulated
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Navigation className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
              You are here
            </p>
            <p className="text-xl font-black text-blue-600">
              {train.currentStation || "---"}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              {Math.round(train.speed)} km/h
            </p>
          </div>

          <div className="text-center">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <ChevronRight className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Next station
            </p>
            <p className="text-xl font-black text-amber-600">
              {train.nextStation || "---"}
            </p>
            {train.delay > 0 && (
              <p className="text-[10px] text-amber-500 mt-1">
                +{Math.round(train.delay)} min delay
              </p>
            )}
          </div>

          <div className="text-center">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <MapPin className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Destination
            </p>
            <p className="text-xl font-black text-green-600">
              {train.destination}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Final stop
            </p>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Journey Progress
            </p>
            <p className="text-[10px] font-bold text-slate-500">
              Source → Destination
            </p>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-3 relative overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "60%" }}
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full"
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-lg"
              style={{ left: "58%" }}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex items-center gap-2">
            {train.isStale ? (
              <WifiOff className="w-3 h-3 text-amber-500" />
            ) : (
              <Wifi className="w-3 h-3 text-green-500" />
            )}
            <span className="uppercase tracking-wider font-bold">
              {train.freshness === "FRESH"
                ? "Live Data"
                : "Stale / No Signal"}
            </span>
          </div>
          <span>Updated {formatTimeAgo(train.timestamp)}</span>
        </div>
      </div>
    </motion.div>
  );
}

function TrainDetailPanel({
  train,
  onClose,
}: {
  train: TrainData;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-3 h-3 rounded-full",
              train.isStale
                ? "bg-slate-400"
                : train.status === "Delayed"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-green-500 animate-pulse"
            )}
          />
          <h3 className="text-lg font-black text-slate-800">
            {train.trainNumber}
          </h3>
          <span className="text-xs text-slate-400">
            {train.name}
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Speed
            </p>
            <p className="text-2xl font-black text-slate-800">
              {Math.round(train.speed)}{" "}
              <span className="text-sm">km/h</span>
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Delay
            </p>
            <p
              className={cn(
                "text-2xl font-black",
                train.delay > 0
                  ? "text-amber-600"
                  : "text-green-600"
              )}
            >
              {train.delay > 0
                ? `+${Math.round(train.delay)}m`
                : "0m"}
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Current
            </p>
            <p className="text-lg font-black text-blue-600">
              {train.currentStation || "---"}
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Next
            </p>
            <p className="text-lg font-black text-amber-600">
              {train.nextStation || "---"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Source
            </p>
            <p className="text-sm font-black text-slate-700">
              {train.source}
            </p>
          </div>

          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Heading
            </p>
            <p className="text-sm font-black text-slate-700">
              {Math.round(train.heading)}°
            </p>
          </div>

          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Freshness
            </p>
            <div className="flex items-center justify-center gap-1">
              {train.isStale ? (
                <WifiOff className="w-3 h-3 text-amber-500" />
              ) : (
                <Wifi className="w-3 h-3 text-green-500" />
              )}
              <p className="text-xs font-bold text-slate-600">
                {train.freshness}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              Data Source:
            </span>
            <span className="text-[9px] font-bold text-slate-600 uppercase">
              {train.sourceLabel}
            </span>
          </div>
          <span className="text-[9px] text-slate-400">
            {formatTimeAgo(train.timestamp)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function MapLegend({
  congestion,
}: {
  congestion: CongestionSection[];
}) {
  const counts = {
    NORMAL: 0,
    CONGESTED: 0,
    SEVERE: 0,
  };

  congestion.forEach((c) => {
    counts[c.status]++;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">
        Section Status
      </p>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-1.5 bg-green-500 rounded-full" />
          <span className="text-[10px] text-slate-600 font-medium">
            Normal ({counts.NORMAL})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-6 h-1.5 bg-amber-500 rounded-full" />
          <span className="text-[10px] text-slate-600 font-medium">
            Congested ({counts.CONGESTED})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-6 h-1.5 bg-red-500 rounded-full" />
          <span className="text-[10px] text-slate-600 font-medium">
            Severe ({counts.SEVERE})
          </span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
          Train Markers
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-0 h-0 border-l-[5px] border-l-blue-600 border-y-[3px] border-y-transparent" />
            <span className="text-[10px] text-slate-600 font-medium">
              On Time
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-0 h-0 border-l-[5px] border-l-amber-500 border-y-[3px] border-y-transparent" />
            <span className="text-[10px] text-slate-600 font-medium">
              Delayed
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-0 h-0 border-l-[5px] border-l-slate-400 border-y-[3px] border-y-transparent opacity-50" />
            <span className="text-[10px] text-slate-600 font-medium">
              Stale / No Signal
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LiveRailwayPage() {
  const { token } = useAuth();
  const { socket, joinTelemetryAll, leaveTelemetryAll } = useSocket();

  const [data, setData] = useState<GISOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTrain, setSelectedTrain] =
    useState<TrainData | null>(null);
  const [passengerMode, setPassengerMode] = useState(false);
  const [trainSearch, setTrainSearch] = useState("");
  const [showWeatherLayer, setShowWeatherLayer] = useState(false);
  const [showCongestion, setShowCongestion] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const selectedTrainRef = useRef<TrainData | null>(null);

  useEffect(() => {
    selectedTrainRef.current = selectedTrain;
  }, [selectedTrain]);

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/gis/overview`, {
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : {},
      });

      if (res.data.success) {
        setData(res.data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch GIS data:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;

    joinTelemetryAll();

    const handleTelemetry = (payload: TelemetryPayload) => {
      setData((prev) => {
        if (!prev) return prev;

        const trainIndex = prev.trains.findIndex(
          (t) => t._id === payload.trainId
        );

        const updated: GISOverview = {
          ...prev,
          trains: [...prev.trains],
        };

        if (trainIndex >= 0) {
          updated.trains[trainIndex] = {
            ...updated.trains[trainIndex],
            latitude: payload.latitude,
            longitude: payload.longitude,
            speed: payload.speed,
            heading: payload.heading,
            currentStation: payload.currentStation,
            nextStation: payload.nextStation,
            delay: payload.accumulatedDelay || 0,
            status:
              payload.status ||
              updated.trains[trainIndex].status,
            freshness:
              payload.freshness ||
              updated.trains[trainIndex].freshness,
            isStale:
              payload.isStale ??
              updated.trains[trainIndex].isStale,
            timestamp: payload.timestamp,
            source:
              payload.source ||
              updated.trains[trainIndex].source,
            sourceLabel:
              payload.sourceLabel ||
              updated.trains[trainIndex].sourceLabel,
          };
        }

        const currentSelectedTrain = selectedTrainRef.current;

        if (
          currentSelectedTrain &&
          currentSelectedTrain._id === payload.trainId
        ) {
          setSelectedTrain(
            updated.trains[trainIndex] || currentSelectedTrain
          );
        }

        setLastUpdated(new Date());

        return updated;
      });
    };

    socket.on("train:telemetry", handleTelemetry);
    socket.on("train:update", handleTelemetry);

    return () => {
      socket.off("train:telemetry", handleTelemetry);
      socket.off("train:update", handleTelemetry);
      leaveTelemetryAll();
    };
  }, [socket, joinTelemetryAll, leaveTelemetryAll]);

  const filteredTrains =
    data?.trains.filter((t) => {
      if (!trainSearch) return true;

      const q = trainSearch.toUpperCase();

      return (
        t.trainNumber.includes(q) ||
        t.name.toUpperCase().includes(q) ||
        t.source.includes(q) ||
        t.destination.includes(q)
      );
    }) || [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="bg-white border-b border-slate-200 px-6 md:px-10 py-4">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <BackButton />

            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-800">
                Live Railway <span className="text-blue-600">GIS</span>
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Real-time train positions and route visualization
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-100">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-green-700 uppercase tracking-widest">
                LIVE
              </span>
            </div>

            {data && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
                <Activity className="w-3 h-3 text-blue-600" />
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
                  {data.sourceLabel}
                </span>
              </div>
            )}

            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
              title="Refresh"
            >
              <Activity
                className={cn(
                  "w-4 h-4 text-slate-500",
                  loading && "animate-spin"
                )}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-6 md:p-10">
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-16 h-16 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin mb-6" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              Loading railway GIS data...
            </p>
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8">
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input
                      type="text"
                      value={trainSearch}
                      onChange={(e) =>
                        setTrainSearch(e.target.value.toUpperCase())
                      }
                      placeholder="Search train..."
                      className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:border-blue-400 focus:bg-white outline-none transition-all placeholder:text-slate-300 w-56"
                    />
                  </div>

                  <button
                    onClick={() => {
                      setPassengerMode(!passengerMode);

                      if (
                        !passengerMode &&
                        filteredTrains.length > 0
                      ) {
                        setSelectedTrain(filteredTrains[0]);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                      passengerMode
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                        : "bg-white border border-slate-200 text-slate-600 hover:border-blue-400"
                    )}
                  >
                    <Eye className="w-4 h-4" />
                    {passengerMode
                      ? "Passenger View"
                      : "Operator View"}
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      setShowCongestion(!showCongestion)
                    }
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all",
                      showCongestion
                        ? "bg-amber-50 border border-amber-200 text-amber-700"
                        : "bg-white border border-slate-200 text-slate-400"
                    )}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Congestion
                  </button>

                  <button
                    onClick={() =>
                      setShowWeatherLayer(!showWeatherLayer)
                    }
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all",
                      showWeatherLayer
                        ? "bg-sky-50 border border-sky-200 text-sky-700"
                        : "bg-white border border-slate-200 text-slate-400"
                    )}
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    Weather
                  </button>

                  <div className="hidden md:flex items-center gap-4 px-4 py-2 bg-white border border-slate-200 rounded-xl">
                    <div className="text-center">
                      <p className="text-lg font-black text-slate-800">
                        {data.trains.length}
                      </p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase">
                        Trains
                      </p>
                    </div>

                    <div className="w-px h-8 bg-slate-200" />

                    <div className="text-center">
                      <p className="text-lg font-black text-slate-800">
                        {data.stations.length}
                      </p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase">
                        Stations
                      </p>
                    </div>

                    <div className="w-px h-8 bg-slate-200" />

                    <div className="text-center">
                      <p className="text-lg font-black text-slate-800">
                        {data.routes.length}
                      </p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase">
                        Routes
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <RailwayMap
                stations={data.stations}
                trains={filteredTrains}
                routes={data.routes}
                congestion={
                  showCongestion ? data.congestion : []
                }
                selectedTrain={selectedTrain}
                onTrainSelect={(t) => {
                  setSelectedTrain(t);
                  setPassengerMode(false);
                }}
                passengerMode={passengerMode}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MapLegend congestion={data.congestion} />

                <div
                  className={cn(
                    "bg-white rounded-2xl border p-4 shadow-sm transition-all",
                    showWeatherLayer
                      ? "border-sky-200 bg-sky-50/50"
                      : "border-slate-200 opacity-60"
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Cloud className="w-4 h-4 text-sky-500" />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Weather Overlay
                    </p>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {showWeatherLayer
                      ? "Weather layer is prepared for integration. Connect weather data from the existing Open-Meteo weather service to display visibility and precipitation conditions along route corridors."
                      : "Enable to prepare weather and visibility overlay layer for future integration."}
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">
                    Data Source Status
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-600 font-medium">
                        Active Source
                      </span>
                      <span className="text-[10px] font-bold text-blue-600">
                        {data.sourceLabel}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-600 font-medium">
                        Last Update
                      </span>
                      <span className="text-[10px] font-bold text-slate-600">
                        {lastUpdated
                          ? formatTimeAgo(lastUpdated.toISOString())
                          : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-600 font-medium">
                        Active Trains
                      </span>
                      <span className="text-[10px] font-bold text-green-600">
                        {data.trains.filter((t) => !t.isStale).length} /{" "}
                        {data.trains.length}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-600 font-medium">
                        Congestion Zones
                      </span>
                      <span className="text-[10px] font-bold text-amber-600">
                        {
                          data.congestion.filter(
                            (c) => c.status !== "NORMAL"
                          ).length
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {passengerMode && selectedTrain && (
                <PassengerPanel train={selectedTrain} />
              )}

              {!passengerMode && selectedTrain && (
                <TrainDetailPanel
                  train={selectedTrain}
                  onClose={() => setSelectedTrain(null)}
                />
              )}

              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                      Active Trains
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400">
                      {filteredTrains.length} trains
                    </span>
                  </div>
                </div>

                <div className="max-h-[500px] overflow-y-auto">
                  {filteredTrains.length === 0 ? (
                    <div className="p-8 text-center">
                      <Train className="w-12 h-12 text-slate-100 mx-auto mb-3" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        No trains found
                      </p>
                    </div>
                  ) : (
                    filteredTrains.map((train) => (
                      <button
                        key={train._id}
                        onClick={() => {
                          setSelectedTrain(train);

                          if (passengerMode) {
                            setPassengerMode(false);
                          }
                        }}
                        className={cn(
                          "w-full px-6 py-4 border-b border-slate-50 hover:bg-slate-50 transition-colors text-left",
                          selectedTrain?._id === train._id &&
                            "bg-blue-50 border-l-2 border-l-blue-600"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-2.5 h-2.5 rounded-full",
                                train.isStale
                                  ? "bg-slate-400"
                                  : train.status === "Delayed"
                                    ? "bg-amber-500 animate-pulse"
                                    : "bg-green-500 animate-pulse"
                              )}
                            />

                            <div>
                              <p className="text-sm font-black text-slate-800">
                                {train.trainNumber}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate max-w-[180px]">
                                {train.name}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-600">
                              {Math.round(train.speed)} km/h
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {train.delay > 0
                                ? `+${Math.round(train.delay)}m`
                                : "On time"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-2 ml-6">
                          <span className="text-[9px] text-slate-400">
                            {train.source}
                          </span>
                          <ChevronRight className="w-3 h-3 text-slate-300" />
                          <span className="text-[9px] text-slate-400">
                            {train.destination}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {passengerMode && !selectedTrain && (
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 text-center">
                  <Eye className="w-12 h-12 text-blue-100 mx-auto mb-4" />
                  <p className="text-sm font-black text-slate-800 mb-2">
                    Select a Train
                  </p>
                  <p className="text-[10px] text-slate-400 leading-relaxed max-w-[200px] mx-auto">
                    Click any train on the map or in the list to see
                    passenger-friendly location and journey info.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-32">
            <Activity className="w-16 h-16 text-slate-100 mx-auto mb-4" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              No railway data available
            </p>
          </div>
        )}
      </div>
    </div>
  );
}