
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import { API_URL } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cloud,
  Droplets,
  Wind,
  X,
  Search,
  RefreshCw,
} from "lucide-react";

interface WeatherData {
  success: boolean;
  stationCode?: string;
  stationName?: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  timezone?: string;
  temperature: number;
  precipitation: number;
  visibility: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  weatherCode: number;
  severity: "NORMAL" | "CAUTION" | "SEVERE";
  source: string;
  isStale: boolean;
  location?: {
    stationCode?: string;
    stationName?: string;
    city?: string;
    latitude: number;
    longitude: number;
  };
  current?: {
    temperature: number;
    feelsLike: number;
    humidity: number;
    weatherCode: number;
    condition: string;
    precipitationProbability: number;
    windSpeed: number;
    windDirection: number;
  } | null;
  forecast?: Array<{
    date: string;
    weatherCode: number;
    condition: string;
    maxTemp: number;
    minTemp: number;
    precipitationProbability: number;
    precipitationSum: number;
    windSpeedMax: number;
  }>;
  tomorrow?: {
    date: string;
    weatherCode: number;
    condition: string;
    maxTemp: number;
    minTemp: number;
    precipitationProbability: number;
    precipitationSum: number;
    windSpeedMax: number;
  } | null;
}

interface StationSuggestion {
  code: string;
  name: string;
  city: string;
  state: string;
  latitude?: number;
  longitude?: number;
}

interface StationApiItem {
  code?: string;
  name?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
}

interface StationApiResponse {
  value?: StationApiItem[];
  stations?: StationApiItem[];
}

interface WeatherIndicatorProps {
  destinationCode?: string;
  destinationName?: string;
  latitude?: number;
  longitude?: number;
  compact?: boolean;
  className?: string;
}

function isNightTime(timestamp?: string, timezone?: string): boolean {
  if (!timestamp) return false;

  try {
    const date = new Date(timestamp);
    const tz = timezone || "Asia/Kolkata";
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    });

    const hour = parseInt(formatter.format(date), 10);
    return hour < 6 || hour >= 18;
  } catch {
    const date = new Date(timestamp);
    const hour = date.getHours();
    return hour < 6 || hour >= 18;
  }
}

function getWeatherIcon(
  code: number,
  timestamp?: string,
  timezone?: string
): string {
  const night = isNightTime(timestamp, timezone);

  if (code === 0) return night ? "\uD83C\uDF19" : "\u2600\uFE0F";
  if (code <= 1) return night ? "\uD83C\uDF19" : "\uD83C\uDF24\uFE0F";
  if (code <= 3) return night ? "\u2601\uFE0F" : "\u26C5\uFE0F";
  if (code <= 48) return "\uD83C\uDF2B\uFE0F";
  if (code <= 57) return "\uD83C\uDF26\uFE0F";
  if (code <= 67) return "\uD83C\uDF27\uFE0F";
  if (code <= 77) return "\u2744\uFE0F";
  if (code <= 82) return "\uD83C\uDF26\uFE0F";
  if (code <= 86) return "\u2744\uFE0F";

  return "\u26C8\uFE0F";
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hrs = Math.floor(mins / 60);

  if (hrs < 24) return `${hrs}h ago`;

  return `${Math.floor(hrs / 24)}d ago`;
}

export default function WeatherIndicatorInner({
  destinationCode,
  destinationName,
  latitude,
  longitude,
  compact = false,
  className = "",
}: WeatherIndicatorProps) {
  const { token } = useAuth();

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<StationSuggestion[]>([]);
  const [searchingStations, setSearchingStations] = useState(false);
  const [resolvedDestination, setResolvedDestination] = useState<string | null>(
    null
  );

  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchWeather = useCallback(
    async (code: string) => {
      if (!token || !code) return;

      setLoading(true);
      setError(null);

      try {
        const res = await axios.get<WeatherData>(`${API_URL}/ai/weather`, {
          params: { stationCode: code },
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.data.success) {
          setWeather(res.data);
          setResolvedDestination(
            res.data.location?.stationName ||
              res.data.location?.city ||
              code
          );
        } else {
          setError("Weather unavailable");
        }
      } catch {
        setError("Weather unavailable");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const fetchWeatherByCoords = useCallback(
    async (lat: number, lng: number) => {
      if (!token) return;

      setLoading(true);
      setError(null);

      try {
        const res = await axios.get<WeatherData>(`${API_URL}/ai/weather`, {
          params: { latitude: lat, longitude: lng },
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.data.success) {
          setWeather(res.data);
          setResolvedDestination(
            res.data.location?.stationName ||
              res.data.location?.city ||
              "Current Location"
          );
        } else {
          setError("Weather unavailable");
        }
      } catch {
        setError("Weather unavailable");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const fetchWeatherByName = useCallback(
    async (name: string) => {
      if (!token || !name) return;

      setLoading(true);
      setError(null);

      try {
        const res = await axios.get<WeatherData>(`${API_URL}/ai/weather`, {
          params: { stationName: name },
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.data.success) {
          setWeather(res.data);
          setResolvedDestination(
            res.data.location?.stationName ||
              res.data.location?.city ||
              name
          );
        } else {
          setError("Weather unavailable");
        }
      } catch {
        setError("Weather unavailable");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const fetchAutoDestination = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const res = await axios.get<WeatherData>(`${API_URL}/ai/weather`, {
        params: { destination: "true" },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data.success) {
        setWeather(res.data);
        setResolvedDestination(
          res.data.location?.stationName ||
            res.data.location?.city ||
            "Destination"
        );
      } else {
        setError(null);
      }
    } catch {
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const searchStations = useCallback(async (query: string) => {
    if (!query || query.trim().length < 1) {
      setSuggestions([]);
      return;
    }

    setSearchingStations(true);

    try {
      const res = await axios.get<
        StationApiItem[] | StationApiResponse
      >(`${API_URL}/stations`, {
        params: { keyword: query },
      });

      const data = Array.isArray(res.data)
        ? res.data
        : res.data.value || res.data.stations || [];

      const validStations = data.filter(
        (station): station is StationApiItem =>
          Boolean(station.code && station.name)
      );

      setSuggestions(
        validStations.slice(0, 8).map((station) => ({
          code: station.code || "",
          name: station.name || "",
          city: station.city || "",
          state: station.state || "",
          latitude: station.latitude,
          longitude: station.longitude,
        }))
      );
    } catch {
      setSuggestions([]);
    } finally {
      setSearchingStations(false);
    }
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        searchStations(value);
      }, 250);
    },
    [searchStations]
  );

  const handleSelectStation = useCallback(
    (station: StationSuggestion) => {
      setSuggestions([]);
      setSearchQuery("");
      fetchWeather(station.code);
    },
    [fetchWeather]
  );

  const handleSearchSubmit = useCallback(() => {
    const query = searchQuery.trim();

    if (!query) return;

    if (suggestions.length > 0) {
      handleSelectStation(suggestions[0]);
    } else {
      fetchWeatherByName(query);
    }

    setSuggestions([]);
    setSearchQuery("");
  }, [searchQuery, suggestions, handleSelectStation, fetchWeatherByName]);

  useEffect(() => {
    if (latitude != null && longitude != null) {
      fetchWeatherByCoords(latitude, longitude);
    } else if (destinationCode) {
      setResolvedDestination(destinationName || null);
      fetchWeather(destinationCode);
    } else {
      fetchAutoDestination();
    }
  }, [
    destinationCode,
    destinationName,
    latitude,
    longitude,
    fetchWeather,
    fetchWeatherByCoords,
    fetchAutoDestination,
  ]);

  useEffect(() => {
    if (!isOpen) return;

    const handler = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSuggestions([]);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handler);

    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const current = weather?.current ?? null;
  const tomorrow = weather?.tomorrow ?? null;

  const locationLabel =
    weather?.location?.stationName ||
    weather?.location?.city ||
    resolvedDestination ||
    destinationName ||
    "Station";

  const showSearch = !weather && !loading;

  if (compact) {
    return (
      <div className={`relative inline-block ${className}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
          title={current ? `Weather at ${locationLabel}` : "Check weather"}
        >
          {loading ? (
            <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          ) : current ? (
            <span className="text-sm leading-none shrink-0">
              {getWeatherIcon(
                current.weatherCode,
                weather?.timestamp,
                weather?.timezone
              )}
            </span>
          ) : (
            <Cloud className="w-3 h-3 text-slate-400" />
          )}

          <span className="font-semibold text-xs">
            {current ? `${current.temperature}\u00B0C` : "\u2014"}
          </span>

          {current && (
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              {locationLabel}
            </span>
          )}
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 z-50 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden"
            >
              <PopoverContent
                weather={weather}
                current={current}
                tomorrow={tomorrow}
                locationLabel={locationLabel}
                error={error}
                loading={loading}
                showSearch={showSearch}
                searchQuery={searchQuery}
                suggestions={suggestions}
                searchingStations={searchingStations}
                onSearchChange={handleSearchChange}
                onSearchSubmit={handleSearchSubmit}
                onSelectStation={handleSelectStation}
                onRefresh={() => {
                  if (destinationCode) {
                    fetchWeather(destinationCode);
                  } else if (latitude != null && longitude != null) {
                    fetchWeatherByCoords(latitude, longitude);
                  } else {
                    fetchAutoDestination();
                  }
                }}
                onChangeLocation={() => {
                  setWeather(null);
                  setError(null);
                  setResolvedDestination(null);
                }}
                onClose={() => {
                  setIsOpen(false);
                  setSuggestions([]);
                  setSearchQuery("");
                }}
                searchInputRef={searchInputRef}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
        title={
          current
            ? `Weather at ${locationLabel}`
            : "Check weather at a station"
        }
      >
        {loading ? (
          <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        ) : current ? (
          <span className="text-base leading-none shrink-0">
            {getWeatherIcon(
              current.weatherCode,
              weather?.timestamp,
              weather?.timezone
            )}
          </span>
        ) : (
          <Cloud className="w-3.5 h-3.5 text-slate-400" />
        )}

        <span className="font-semibold text-xs">
          {current ? `${current.temperature}\u00B0C` : "\u2014"}
        </span>

        <span className="text-[10px] text-slate-400 hidden sm:inline">
          Weather
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden"
          >
            <PopoverContent
              weather={weather}
              current={current}
              tomorrow={tomorrow}
              locationLabel={locationLabel}
              error={error}
              loading={loading}
              showSearch={showSearch}
              searchQuery={searchQuery}
              suggestions={suggestions}
              searchingStations={searchingStations}
              onSearchChange={handleSearchChange}
              onSearchSubmit={handleSearchSubmit}
              onSelectStation={handleSelectStation}
              onRefresh={() => {
                if (destinationCode) {
                  fetchWeather(destinationCode);
                } else if (latitude != null && longitude != null) {
                  fetchWeatherByCoords(latitude, longitude);
                } else {
                  fetchAutoDestination();
                }
              }}
              onChangeLocation={() => {
                setWeather(null);
                setError(null);
                setResolvedDestination(null);
              }}
              onClose={() => {
                setIsOpen(false);
                setSuggestions([]);
                setSearchQuery("");
              }}
              searchInputRef={searchInputRef}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PopoverContent({
  weather,
  current,
  tomorrow,
  locationLabel,
  error,
  loading,
  showSearch,
  searchQuery,
  suggestions,
  searchingStations,
  onSearchChange,
  onSearchSubmit,
  onSelectStation,
  onRefresh,
  onChangeLocation,
  onClose,
  searchInputRef,
}: {
  weather: WeatherData | null;
  current: WeatherData["current"];
  tomorrow: WeatherData["tomorrow"];
  locationLabel: string;
  error: string | null;
  loading: boolean;
  showSearch: boolean;
  searchQuery: string;
  suggestions: StationSuggestion[];
  searchingStations: boolean;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onSelectStation: (station: StationSuggestion) => void;
  onRefresh: () => void;
  onChangeLocation: () => void;
  onClose: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  if (loading && !weather) {
    return (
      <>
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-700">Weather</p>
        </div>

        <div className="px-4 py-8 flex items-center justify-center gap-3">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">
            Fetching weather...
          </p>
        </div>
      </>
    );
  }

  if (error && !weather) {
    return (
      <>
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-700">Weather</p>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>

        <div className="px-4 py-4">
          <p className="text-xs text-amber-600 font-medium mb-2">
            Weather information is temporarily unavailable.
          </p>

          <div className="flex gap-2">
            <button
              onClick={onRefresh}
              className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 font-bold"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>

            <button
              onClick={onChangeLocation}
              className="text-[10px] text-slate-400 hover:text-slate-600 font-medium"
            >
              Search a different location
            </button>
          </div>
        </div>
      </>
    );
  }

  if (showSearch && !weather) {
    return (
      <>
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-700">Check weather</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Search city or station
          </p>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />

            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) =>
                event.key === "Enter" && onSearchSubmit()
              }
              placeholder="Search city or station"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-400 focus:bg-white outline-none transition-all placeholder:text-slate-300"
            />
          </div>

          {suggestions.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-100">
              {suggestions.map((station) => (
                <button
                  key={station.code}
                  onClick={() => onSelectStation(station)}
                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">
                      {station.name}
                    </p>

                    <p className="text-[10px] text-slate-400">
                      {station.city}
                      {station.state ? `, ${station.state}` : ""}
                    </p>
                  </div>

                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded ml-2">
                    {station.code}
                  </span>
                </button>
              ))}
            </div>
          )}

          {searchingStations && (
            <div className="mt-2 flex items-center gap-2 px-1">
              <div className="w-3 h-3 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-[10px] text-slate-400">
                Searching...
              </span>
            </div>
          )}

          {!searchingStations &&
            searchQuery.trim().length >= 1 &&
            suggestions.length === 0 && (
              <p className="mt-2 text-[10px] text-slate-400 px-1">
                No matching city or station found. Try a different search.
              </p>
            )}
        </div>
      </>
    );
  }

  if (weather?.success && current) {
    return (
      <>
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">
              {locationLabel}
            </p>

            <p className="text-[10px] text-slate-400 uppercase tracking-wider">
              {weather.stationCode ||
                weather.location?.stationCode ||
                "Current Weather"}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              className="p-1 rounded-lg hover:bg-slate-200 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3 h-3 text-slate-500" />
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl shrink-0">
                {getWeatherIcon(
                  current.weatherCode,
                  weather.timestamp,
                  weather.timezone
                )}
              </span>

              <div>
                <p className="text-2xl font-black text-slate-800 leading-none">
                  {current.temperature}&deg;C
                </p>

                <p className="text-[10px] text-slate-400 mt-0.5">
                  Feels {current.feelsLike}&deg;C
                </p>
              </div>
            </div>

            <p className="text-xs font-medium text-slate-600 text-right">
              {current.condition}
            </p>
          </div>

          <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500">
            {current.precipitationProbability != null && (
              <span className="flex items-center gap-1">
                <Droplets className="w-3 h-3 text-blue-400" />
                {current.precipitationProbability}% rain
              </span>
            )}

            {current.windSpeed != null && (
              <span className="flex items-center gap-1">
                <Wind className="w-3 h-3 text-slate-400" />
                {current.windSpeed} km/h
              </span>
            )}

            {current.humidity != null && (
              <span className="flex items-center gap-1">
                <Droplets className="w-3 h-3 text-slate-300" />
                {current.humidity}%
              </span>
            )}
          </div>
        </div>

        {tomorrow && (
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Tomorrow
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg shrink-0">
                  {getWeatherIcon(
                    tomorrow.weatherCode,
                    weather.timestamp,
                    weather.timezone
                  )}
                </span>

                <div>
                  <p className="text-sm font-bold text-slate-700">
                    {tomorrow.minTemp}&deg; &mdash; {tomorrow.maxTemp}&deg;C
                  </p>

                  <p className="text-[10px] text-slate-400">
                    {tomorrow.condition}
                  </p>
                </div>
              </div>

              {tomorrow.precipitationProbability != null && (
                <span className="text-[11px] text-blue-500 font-medium">
                  {tomorrow.precipitationProbability}% rain
                </span>
              )}
            </div>
          </div>
        )}

        <div className="px-4 py-2 bg-slate-50 flex items-center justify-between">
          <p className="text-[9px] text-slate-400">
            Source: {weather.source} | Updated{" "}
            {formatTimeAgo(weather.timestamp)}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={onChangeLocation}
              className="text-[9px] text-blue-500 hover:text-blue-700 font-medium"
            >
              Change
            </button>
          </div>
        </div>
      </>
    );
  }

  return null;
}
