/**
 * Client-side journey state derivation.
 * Single source of truth for Journey Progress, Timeline, Map, ETA and Live Update card.
 * All values derive from the same tracking payload — never independently invented.
 */

export type JourneyStatus =
  | "NOT_STARTED"
  | "DEPARTED"
  | "IN_TRANSIT"
  | "ARRIVING"
  | "AT_STATION"
  | "DEPARTED_STATION"
  | "DELAYED"
  | "COMPLETED";

export type StationTimelineStatus =
  | "COMPLETED"
  | "CURRENT"
  | "NEXT"
  | "UPCOMING"
  | "DESTINATION";

export interface RouteStationInfo {
  code: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  sequence: number;
  distanceFromOrigin: number;
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
}

export interface RouteSegment {
  fromStation: string;
  toStation: string;
  distance: number;
  typicalSpeed?: number;
  maxSpeed?: number;
  sectionType?: string;
  from: { lat: number; lng: number; name: string };
  to: { lat: number; lng: number; name: string };
}

export interface JourneyProgressInput {
  routeStations: RouteStationInfo[];
  routeSegments: RouteSegment[];
  sectionIndex: number;
  progressInSection: number;
  currentStation?: string | null;
  nextStation?: string | null;
  source?: string;
  destination?: string;
  speed?: number;
  delayMinutes?: number;
  serverProgress?: number | null;
  departureTime?: string | null;
  arrivalTime?: string | null;
}

export interface JourneyState {
  percentage: number;
  distanceTravelled: number;
  totalDistance: number;
  remainingDistance: number;
  distanceToNext: number;
  currentStation: string | null;
  previousStation: string | null;
  nextStation: string | null;
  destination: string | null;
  source: string | null;
  status: JourneyStatus;
  speed: number;
  delayMinutes: number;
  currentLocationLabel: string;
  sectionLabel: string;
}

export interface TimelineStation extends RouteStationInfo {
  index: number;
  status: StationTimelineStatus;
  delayMinutes: number;
}

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

function stationNameMap(stations: RouteStationInfo[]): Record<string, string> {
  const map: Record<string, string> = {};
  stations.forEach((s) => {
    map[s.code] = s.name || s.code;
  });
  return map;
}

/**
 * Calculate journey progress from actual route geometry + live section state.
 * Never returns a value outside 0..100. Does not reset to 0 when data is partial
 * if the train has clearly progressed past the origin.
 */
export function calculateJourneyProgress(input: JourneyProgressInput): JourneyState {
  const {
    routeStations = [],
    routeSegments = [],
    sectionIndex: rawSectionIndex,
    progressInSection: rawProgressInSection,
    currentStation: inputCurrent,
    nextStation: inputNext,
    source = routeStations[0]?.code ?? null,
    destination = routeStations[routeStations.length - 1]?.code ?? null,
    speed = 0,
    delayMinutes = 0,
    serverProgress = null,
  } = input;

  const names = stationNameMap(routeStations);
  const sectionIndex = clamp(Math.floor(Number(rawSectionIndex) || 0), 0, Number.MAX_SAFE_INTEGER);
  const progressInSection = Math.max(0, Number(rawProgressInSection) || 0);
  const safeSpeed = Math.max(0, Number(speed) || 0);
  const safeDelay = Math.round(Number(delayMinutes) || 0);

  const segmentDistances = routeSegments.map((s) => Math.max(0, Number(s.distance) || 0));
  const totalFromSegments = segmentDistances.reduce((a, b) => a + b, 0);
  const totalFromStations =
    routeStations.length > 0
      ? Math.max(0, Number(routeStations[routeStations.length - 1].distanceFromOrigin) || 0)
      : 0;
  const totalDistance = totalFromSegments > 0 ? totalFromSegments : totalFromStations;

  let distanceTravelled = 0;
  let distanceToNext = 0;

  if (totalFromSegments > 0) {
    const completedSegments = Math.min(sectionIndex, routeSegments.length);
    for (let i = 0; i < completedSegments; i++) {
      distanceTravelled += segmentDistances[i];
    }
    const active = routeSegments[Math.min(sectionIndex, routeSegments.length - 1)];
    if (active) {
      const sectionDistance = Math.max(0, Number(active.distance) || 0);
      const inSection = Math.min(progressInSection, sectionDistance);
      distanceTravelled += inSection;
      distanceToNext = Math.max(0, sectionDistance - inSection);
    }
  } else if (totalFromStations > 0 && routeStations.length > 1) {
    const idx = routeStations.findIndex((s) => s.code === inputCurrent);
    const safeIdx = idx >= 0 ? idx : 0;
    const base = Math.max(0, Number(routeStations[safeIdx]?.distanceFromOrigin) || 0);
    const next = routeStations[safeIdx + 1];
    const nextDist = next ? Math.max(0, Number(next.distanceFromOrigin) || 0) : totalFromStations;
    const segmentLen = Math.max(0, nextDist - base);
    const ratio = segmentLen > 0 ? clamp(progressInSection / segmentLen, 0, 1) : 0;
    distanceTravelled = base + segmentLen * ratio;
    distanceToNext = Math.max(0, nextDist - distanceTravelled);
  }

  distanceTravelled = totalDistance > 0 ? clamp(distanceTravelled, 0, totalDistance) : distanceTravelled;
  const remainingDistance = Math.max(0, totalDistance - distanceTravelled);

  let percentage =
    totalDistance > 0 ? (distanceTravelled / totalDistance) * 100 : 0;

  // Station chain resolution
  let currentStation = inputCurrent || null;
  let nextStation = inputNext || null;
  let previousStation: string | null = null;

  const activeSegment = routeSegments[Math.min(sectionIndex, Math.max(0, routeSegments.length - 1))];
  if (routeSegments.length > 0 && activeSegment) {
    const sectionDistance = Math.max(0, Number(activeSegment.distance) || 0);
    const arrived = sectionDistance > 0 && progressInSection >= sectionDistance;
    const derivedCurrent = arrived ? activeSegment.toStation : activeSegment.fromStation;
    currentStation = inputCurrent || derivedCurrent;
    nextStation = inputNext || activeSegment.toStation;
  }

  if (!currentStation && routeStations.length > 0) {
    currentStation = routeStations[0].code;
  }
  if (!nextStation && routeStations.length > 1) {
    const idx = routeStations.findIndex((s) => s.code === currentStation);
    nextStation = idx >= 0 ? routeStations[idx + 1]?.code || destination : routeStations[1].code;
  }

  const atDestination =
    (destination != null && currentStation === destination) ||
    (routeSegments.length > 0 && sectionIndex >= routeSegments.length) ||
    percentage >= 100 ||
    (routeStations.length > 0 &&
      currentStation === routeStations[routeStations.length - 1].code &&
      safeSpeed === 0 &&
      totalDistance > 0 &&
      distanceTravelled >= totalDistance - 0.5);

  if (atDestination) {
    percentage = 100;
    distanceTravelled = totalDistance || distanceTravelled;
    distanceToNext = 0;
    if (destination) {
      currentStation = destination;
      nextStation = destination;
    }
  }

  // Never show 0% when the train has clearly departed intermediate stations
  if (!atDestination && routeStations.length > 0 && currentStation) {
    const curIdx = routeStations.findIndex((s) => s.code === currentStation);
    if (curIdx > 0 && totalDistance > 0) {
      const minFromStations = Number(routeStations[curIdx].distanceFromOrigin) || 0;
      if (distanceTravelled < minFromStations) {
        distanceTravelled = Math.min(totalDistance, minFromStations);
        percentage = (distanceTravelled / totalDistance) * 100;
        distanceToNext = Math.max(0, totalDistance - distanceTravelled);
      }
    }
  }

  // Server progress used only as a floor when geometry is unavailable
  if (totalDistance <= 0 && serverProgress != null && Number.isFinite(serverProgress)) {
    percentage = clamp(serverProgress, 0, 100);
  }

  percentage = Math.round(clamp(percentage, 0, 100));

  const curIdx = currentStation
    ? routeStations.findIndex((s) => s.code === currentStation)
    : -1;
  previousStation =
    curIdx > 0
      ? routeStations[curIdx - 1].code
      : source || routeStations[0]?.code || null;

  if (curIdx >= 0 && curIdx < routeStations.length - 1 && !nextStation) {
    nextStation = routeStations[curIdx + 1].code;
  }
  if (atDestination && destination) nextStation = destination;

  const sectionDistance = activeSegment ? Math.max(0, Number(activeSegment.distance) || 0) : 0;
  const arrivedAtSectionEnd = sectionDistance > 0 && progressInSection >= sectionDistance;

  let status: JourneyStatus;
  if (atDestination) {
    status = "COMPLETED";
  } else if (sectionIndex === 0 && progressInSection === 0 && safeSpeed === 0 && percentage <= 0) {
    status = "NOT_STARTED";
  } else if (safeSpeed === 0 && arrivedAtSectionEnd) {
    status = safeDelay > 0 ? "DELAYED" : "AT_STATION";
  } else if (safeSpeed === 0 && safeDelay > 0) {
    status = "DELAYED";
  } else if (safeSpeed === 0) {
    status = "AT_STATION";
  } else {
    const remainingInSection = sectionDistance - Math.min(progressInSection, sectionDistance);
    if (sectionDistance > 0 && remainingInSection <= 5) status = "ARRIVING";
    else status = percentage > 0 ? "IN_TRANSIT" : "DEPARTED";
  }

  const currentName = currentStation ? names[currentStation] || currentStation : "—";
  const nextName = nextStation ? names[nextStation] || nextStation : "—";

  let currentLocationLabel: string;
  if (atDestination) {
    currentLocationLabel = destination ? names[destination] || destination : currentName;
  } else if (safeSpeed === 0 && currentStation) {
    currentLocationLabel = currentName;
  } else if (currentStation && nextStation && currentStation !== nextStation) {
    currentLocationLabel = `Between ${currentName} and ${nextName}`;
  } else {
    currentLocationLabel = currentName;
  }

  const sectionLabel =
    currentStation && nextStation && currentStation !== nextStation && !atDestination
      ? `${currentStation} → ${nextStation}`
      : atDestination
        ? destination || "—"
        : currentStation || "—";

  return {
    percentage,
    distanceTravelled: Math.round(distanceTravelled),
    totalDistance: Math.round(totalDistance),
    remainingDistance: Math.round(remainingDistance),
    distanceToNext: Math.round(distanceToNext),
    currentStation,
    previousStation,
    nextStation,
    destination: destination ?? null,
    source: source ?? null,
    status,
    speed: safeSpeed,
    delayMinutes: safeDelay,
    currentLocationLabel,
    sectionLabel,
  };
}

/**
 * Build full timeline statuses from the same journey state.
 * Completed stations stay completed; only the true current/next change.
 */
export function buildTimeline(
  stations: RouteStationInfo[],
  journey: Pick<JourneyState, "currentStation" | "nextStation" | "destination" | "delayMinutes" | "status">
): TimelineStation[] {
  if (!stations?.length) return [];

  const currentIdx = journey.currentStation
    ? stations.findIndex((s) => s.code === journey.currentStation)
    : -1;
  const nextIdx = journey.nextStation
    ? stations.findIndex((s) => s.code === journey.nextStation)
    : -1;
  const destIdx = stations.length - 1;
  const arrived = journey.status === "COMPLETED";

  return stations.map((st, index) => {
    let status: StationTimelineStatus = "UPCOMING";

    if (index < currentIdx) {
      status = "COMPLETED";
    } else if (index === currentIdx) {
      // Destination arrival ends the journey; otherwise this is the live anchor.
      status = arrived && index === destIdx ? "COMPLETED" : "CURRENT";
    } else if (index === nextIdx || index === currentIdx + 1) {
      status = index === destIdx ? "DESTINATION" : "NEXT";
    } else if (index === destIdx) {
      status = "DESTINATION";
    } else {
      status = "UPCOMING";
    }

    if (arrived && index === destIdx) {
      status = "COMPLETED";
    }

    return {
      ...st,
      index,
      status,
      delayMinutes: journey.delayMinutes,
    };
  });
}

export interface LiveUpdateLines {
  headline: string;
  lines: { label: string; value: string }[];
}

export function buildLiveUpdate(
  journey: JourneyState,
  names: Record<string, string>,
  options: {
    estimatedArrival?: string | null;
    lastUpdatedSecondsAgo?: number;
    isStale?: boolean;
    departedAtLabel?: string;
  } = {}
): LiveUpdateLines {
  const nameOf = (code?: string | null) =>
    code ? names[code] || code : "—";

  const {
    estimatedArrival = null,
    lastUpdatedSecondsAgo,
    isStale = false,
  } = options;

  let headline: string;
  if (isStale) {
    headline = "Live update unavailable — showing last known position.";
  } else if (journey.status === "NOT_STARTED") {
    headline = `Train is at ${nameOf(journey.source)} and has not departed yet.`;
  } else if (journey.status === "COMPLETED") {
    headline = `Train has arrived at ${nameOf(journey.destination)}.`;
  } else if (journey.status === "ARRIVING") {
    headline = `Train is approaching ${nameOf(journey.nextStation)}.`;
  } else if (journey.status === "AT_STATION") {
    headline = `Train is stopped at ${nameOf(journey.currentStation)}.`;
  } else if (journey.status === "DELAYED") {
    headline = `Train is held at ${nameOf(journey.currentStation)} and running late.`;
  } else if (journey.currentStation && journey.nextStation && journey.currentStation !== journey.nextStation) {
    headline = `Train is currently between ${nameOf(journey.currentStation)} and ${nameOf(journey.nextStation)}.`;
  } else {
    headline = `Train is moving toward ${nameOf(journey.nextStation)}.`;
  }

  const supporting: string[] = [];
  if (journey.status !== "NOT_STARTED" && journey.status !== "COMPLETED") {
    if (journey.delayMinutes > 0) {
      supporting.push(`Running ${formatDelay(journey.delayMinutes)} behind schedule.`);
    } else if (journey.delayMinutes < 0) {
      supporting.push(`Running ${formatDelay(Math.abs(journey.delayMinutes))} ahead of schedule.`);
    } else {
      supporting.push("Running on time.");
    }
    if (journey.speed > 0) {
      supporting.push(`Currently travelling at ${Math.round(journey.speed)} km/h.`);
    }
    if (journey.nextStation) {
      supporting.push(`Next stop: ${nameOf(journey.nextStation)}.`);
    }
  }

  const headlineFull = supporting.length
    ? `${headline} ${supporting.join(" ")}`
    : headline;

  const etaTime = estimatedArrival
    ? new Date(estimatedArrival).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const lines: { label: string; value: string }[] = [
    { label: "Speed", value: journey.speed > 0 ? `${Math.round(journey.speed)} km/h` : "Stopped" },
    {
      label: "Delay",
      value:
        journey.delayMinutes > 0
          ? `+${journey.delayMinutes} min`
          : journey.delayMinutes < 0
            ? `${journey.delayMinutes} min`
            : "On time",
    },
    { label: "Next stop", value: nameOf(journey.nextStation) },
    { label: "ETA", value: etaTime },
    {
      label: "Updated",
      value:
        lastUpdatedSecondsAgo != null
          ? lastUpdatedSecondsAgo < 5
            ? "just now"
            : lastUpdatedSecondsAgo < 60
              ? `${lastUpdatedSecondsAgo} seconds ago`
              : `${Math.floor(lastUpdatedSecondsAgo / 60)} min ago`
          : "—",
    },
  ];

  return { headline: headlineFull, lines };
}

function formatDelay(minutes: number): string {
  const n = Math.abs(Math.round(minutes));
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function formatMinutesShort(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const n = Math.round(minutes);
  if (n <= 0) return "0 min";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
