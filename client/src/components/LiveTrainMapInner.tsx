"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface StationInfo {
  code: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  distanceFromOrigin?: number;
}

interface RouteSegment {
  fromStation: string;
  toStation: string;
  distance: number;
  from: { lat: number; lng: number; name: string };
  to: { lat: number; lng: number; name: string };
}

interface StationStop {
  fromStation: string;
  toStation: string;
  sectionIndex: number;
  scheduledTravelTimeMinutes: number;
  predictedDelayMinutes: number;
  predictedArrival: string;
  accumulatedDelay: number;
}

interface LiveTrainMapProps {
  stations: StationInfo[];
  segments: RouteSegment[];
  currentLat: number;
  currentLng: number;
  currentStation: string;
  nextStation: string;
  source: string;
  destination: string;
  heading: number;
  trainNumber: string;
  speed?: number;
  delay?: number;
  progress?: number;
  status?: string;
  stationETAs: StationStop[];
}

function MapController({
  currentLat,
  currentLng,
  stations,
  shouldCenterOnTrain,
  setShouldCenterOnTrain,
}: {
  currentLat: number;
  currentLng: number;
  stations: StationInfo[];
  shouldCenterOnTrain: boolean;
  setShouldCenterOnTrain: (val: boolean) => void;
}) {
  const map = useMap();
  const lastFittedKeyRef = useRef<string | null>(null);
  const stationsKey = useMemo(
    () => stations.map((s) => s.code).join("|"),
    [stations]
  );

  // Fit route bounds once per route — never yank the map while the user explores
  useEffect(() => {
    if (!stationsKey || lastFittedKeyRef.current === stationsKey) return;
    const valid = stations.filter((s) => s.latitude && s.longitude);
    if (valid.length > 0) {
      const bounds = L.latLngBounds(valid.map((s) => [s.latitude, s.longitude] as [number, number]));
      map.fitBounds(bounds, { padding: [50, 50] });
      lastFittedKeyRef.current = stationsKey;
    }
  }, [stationsKey, stations, map]);

  useEffect(() => {
    if (shouldCenterOnTrain && currentLat && currentLng) {
      map.setView([currentLat, currentLng], Math.max(map.getZoom(), 9));
      setShouldCenterOnTrain(false);
    }
  }, [shouldCenterOnTrain, currentLat, currentLng, map, setShouldCenterOnTrain]);

  return null;
}

/** Smoothly interpolates train marker between telemetry updates. */
function AnimatedMarker({
  targetLat,
  targetLng,
  icon,
  children,
}: {
  targetLat: number;
  targetLng: number;
  icon: L.DivIcon;
  children?: React.ReactNode;
}) {
  const [pos, setPos] = useState<[number, number]>(() =>
    Number.isFinite(targetLat) && Number.isFinite(targetLng) ? [targetLat, targetLng] : [0, 0]
  );
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef<[number, number]>([targetLat, targetLng]);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return;
    const from = fromRef.current;
    const to: [number, number] = [targetLat, targetLng];
    if (from[0] === to[0] && from[1] === to[1]) {
      fromRef.current = to;
      return;
    }

    const duration = 900;
    startRef.current = Date.now();

    const step = () => {
      const t = Math.min(1, (Date.now() - startRef.current) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      const next: [number, number] = [
        from[0] + (to[0] - from[0]) * ease,
        from[1] + (to[1] - from[1]) * ease,
      ];
      setPos(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
        rafRef.current = null;
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      fromRef.current = [targetLat, targetLng];
    };
  }, [targetLat, targetLng]);

  return (
    <Marker position={pos} icon={icon}>
      {children}
    </Marker>
  );
}

export default function LiveTrainMapInner({
  stations,
  segments,
  currentLat,
  currentLng,
  currentStation,
  nextStation,
  destination,
  heading,
  trainNumber,
  speed = 0,
  delay = 0,
  progress = 0,
  status = "",
  stationETAs,
}: LiveTrainMapProps) {
  const [shouldCenterOnTrain, setShouldCenterOnTrain] = useState(false);

  const currentStationIndex = stations.findIndex((s) => s.code === currentStation);
  const nextStationIndex = stations.findIndex((s) => s.code === nextStation);

  const createStationIcon = (state: "completed" | "current" | "next" | "upcoming" | "destination") => {
    const styles: Record<string, { color: string; size: number; ring?: string }> = {
      completed: { color: "#16a34a", size: 12 },
      current: { color: "#2563eb", size: 18, ring: "rgba(37,99,235,0.35)" },
      next: { color: "#f59e0b", size: 14 },
      upcoming: { color: "#94a3b8", size: 10 },
      destination: { color: "#7c3aed", size: 14 },
    };
    const s = styles[state] || styles.upcoming;
    return L.divIcon({
      className: "custom-station-icon",
      html: `<div style="position:relative;width:${s.size}px;height:${s.size}px;">
        ${s.ring ? `<div style="position:absolute;inset:-6px;border-radius:50%;background:${s.ring};"></div>` : ""}
        <div style="position:absolute;inset:0;border-radius:50%;border:2px solid white;background-color:${s.color};box-shadow:0 0 6px rgba(0,0,0,0.35);"></div>
      </div>`,
      iconSize: [s.size, s.size],
      iconAnchor: [s.size / 2, s.size / 2],
    });
  };

  const createTrainIcon = () => {
    const delayLabel = delay > 0 ? `+${Math.round(delay)}m` : "";
    return L.divIcon({
      className: "custom-train-icon",
      html: `
        <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:36px;height:36px;border-radius:50%;background-color:rgba(37,99,235,0.28);animation:ping 2s cubic-bezier(0,0,0.2,1)infinite;"></div>
          <div style="position:absolute;width:28px;height:28px;border-radius:50%;background-color:#2563eb;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);transform:rotate(${heading}deg);">
            <span style="color:white;font-size:13px;font-weight:bold;transform:rotate(-${heading}deg);line-height:1;">🚆</span>
          </div>
          <div style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);background:#0f172a;color:white;font-size:9px;font-weight:800;padding:2px 6px;border-radius:999px;white-space:nowrap;letter-spacing:0.04em;box-shadow:0 2px 6px rgba(0,0,0,0.35);">
            ${trainNumber}${delayLabel ? ` · ${delayLabel}` : ""}
          </div>
          <div style="position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);background:white;color:#1e293b;font-size:9px;font-weight:800;padding:1px 6px;border-radius:999px;white-space:nowrap;border:1px solid #e2e8f0;box-shadow:0 1px 4px rgba(0,0,0,0.15);">
            ${Math.round(speed)} km/h · ${Math.round(progress)}%
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  };

  const getStationState = (
    st: StationInfo,
    idx: number
  ): "completed" | "current" | "next" | "upcoming" | "destination" => {
    if (st.code === currentStation) return "current";
    if (currentStationIndex >= 0 && idx < currentStationIndex) return "completed";
    if (st.code === nextStation || idx === nextStationIndex) {
      return st.code === destination ? "destination" : "next";
    }
    if (st.code === destination) return "destination";
    return "upcoming";
  };

  const completedCoords: [number, number][] = [];
  const remainingCoords: [number, number][] = [];

  segments.forEach((seg) => {
    const fromIdx = stations.findIndex((s) => s.code === seg.fromStation);
    const toIdx = stations.findIndex((s) => s.code === seg.toStation);
    const isCompleted =
      fromIdx !== -1 &&
      toIdx !== -1 &&
      currentStationIndex >= 0 &&
      toIdx <= currentStationIndex;

    const coords: [number, number][] = [
      [seg.from.lat, seg.from.lng],
      [seg.to.lat, seg.to.lng],
    ];

    if (isCompleted) {
      completedCoords.push(...coords);
    } else {
      remainingCoords.push(...coords);
    }
  });

  const trainIcon = createTrainIcon();

  const delayLabel =
    delay > 0 ? `+${Math.round(delay)} min` : delay < 0 ? `${Math.round(delay)} min` : "On time";

  return (
    <div className="relative w-full h-[500px] bg-slate-100 rounded-[2rem] overflow-hidden border border-slate-200 shadow-inner">
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {completedCoords.length > 0 && (
          <Polyline
            positions={completedCoords}
            color="#22c55e"
            weight={5}
            opacity={0.85}
          />
        )}

        {remainingCoords.length > 0 && (
          <Polyline
            positions={remainingCoords}
            color="#3b82f6"
            weight={5}
            opacity={0.9}
            dashArray="10 8"
          />
        )}

        {stations.map((st, idx) => {
          const stationState = getStationState(st, idx);
          const stopEta = stationETAs.find((e) => e.toStation === st.code);
          const arrivalTimeStr = stopEta?.predictedArrival
            ? new Date(stopEta.predictedArrival).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Calculating...";

          const statusLabel =
            stationState === "current"
              ? "Train Here"
              : stationState === "completed"
                ? "Departed"
                : stationState === "next"
                  ? "Next Stop"
                  : stationState === "destination"
                    ? "Destination"
                    : "Upcoming";

          return (
            <Marker
              key={st.code}
              position={[st.latitude, st.longitude]}
              icon={createStationIcon(stationState)}
            >
              <Popup>
                <div className="p-2 font-sans">
                  <h4 className="font-extrabold text-slate-800 text-sm">{st.name} ({st.code})</h4>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    {st.city}, {st.state}
                  </p>
                  <p className="text-xs text-slate-600 font-bold mt-2">
                    Estimated Arrival: <span className="text-blue-600 font-mono">{arrivalTimeStr}</span>
                  </p>
                  <p className="text-xs text-slate-600 font-bold mt-1">
                    Status:{" "}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest ${
                        stationState === "current"
                          ? "bg-blue-100 text-blue-700"
                          : stationState === "completed"
                            ? "bg-green-100 text-green-700"
                            : stationState === "next"
                              ? "bg-amber-100 text-amber-700"
                              : stationState === "destination"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {Number.isFinite(currentLat) && Number.isFinite(currentLng) && currentLat !== 0 && currentLng !== 0 && (
          <AnimatedMarker
            targetLat={currentLat}
            targetLng={currentLng}
            icon={trainIcon}
          >
            <Popup>
              <div className="p-2 font-sans">
                <h4 className="font-black text-blue-600 text-sm">Train {trainNumber}</h4>
                <p className="text-xs font-bold text-slate-700 mt-1">
                  Speed: <span className="font-mono">{Math.round(speed)} km/h</span>
                </p>
                <p className="text-xs font-bold text-slate-700">
                  Progress: <span className="font-mono">{Math.round(progress)}%</span>
                </p>
                <p className="text-xs font-bold text-slate-700">
                  Delay: <span className="font-mono">{delayLabel}</span>
                </p>
                <p className="text-xs font-bold text-slate-700 mt-1">
                  Section: <span className="text-slate-500">{currentStation} → {nextStation}</span>
                </p>
                {status && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                    {status.replace(/_/g, " ")}
                  </p>
                )}
              </div>
            </Popup>
          </AnimatedMarker>
        )}

        <MapController
          currentLat={currentLat}
          currentLng={currentLng}
          stations={stations}
          shouldCenterOnTrain={shouldCenterOnTrain}
          setShouldCenterOnTrain={setShouldCenterOnTrain}
        />
      </MapContainer>

      <div className="absolute top-4 left-4 z-[1000] flex flex-wrap gap-2">
        <span className="px-2.5 py-1 rounded-lg bg-white/95 border border-slate-200 text-[10px] font-black uppercase tracking-wider text-green-700 shadow-sm">
          ● Traveled
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-white/95 border border-slate-200 text-[10px] font-black uppercase tracking-wider text-blue-700 shadow-sm">
          ── Remaining
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-white/95 border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600 shadow-sm">
          🚆 Train
        </span>
      </div>

      <button
        onClick={() => setShouldCenterOnTrain(true)}
        className="absolute bottom-4 right-4 z-[1000] px-4 py-2 bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-blue-700 shadow-lg active:scale-95 transition-all"
      >
        Center on Train
      </button>
    </div>
  );
}
