
"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
  MapPin,
  Calendar,
  Loader2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Globe,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { cn } from "@/utils/cn";
import { todayIST, isDateBeforeTodayIST } from "@/utils/istTime";

const STATION_CODES = ["NDLS", "BCT", "HWH", "MAS", "SBC", "CST", "PUNE", "BZA"];

const STATION_NAMES: Record<string, string> = {
  NDLS: "New Delhi",
  BCT: "Mumbai Central",
  HWH: "Howrah Junction",
  MAS: "Chennai Central",
  SBC: "Bengaluru City Junction",
  CST: "Mumbai Chhatrapati Shivaji Terminus",
  PUNE: "Pune Junction",
  BZA: "Vijayawada Junction",
};

interface SearchParams {
  source: string;
  destination: string;
  date: string;
}

type SearchErrors = Partial<Record<keyof SearchParams, string>>;

export default function SearchTrain() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<SearchErrors>({});
  const [searchParams, setSearchParams] = useState<SearchParams>({
    source: "",
    destination: "",
    date: "",
  });

  const validateForm = () => {
    const newErrors: SearchErrors = {};

    if (!searchParams.source.trim()) {
      newErrors.source = "Please choose a station";
    } else if (!STATION_CODES.includes(searchParams.source.toUpperCase())) {
      newErrors.source = "Please choose a valid station";
    }

    if (!searchParams.destination.trim()) {
      newErrors.destination = "Please choose a station";
    } else if (
      !STATION_CODES.includes(searchParams.destination.toUpperCase())
    ) {
      newErrors.destination = "Please choose a valid station";
    }

    if (!searchParams.date) {
      newErrors.date = "Please choose a journey date";
    } else if (isDateBeforeTodayIST(searchParams.date)) {
      newErrors.date = "Please choose a future date";
    }

    if (
      searchParams.source.toUpperCase() ===
      searchParams.destination.toUpperCase()
    ) {
      newErrors.destination = "Origin and destination must be different";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors above");
      return;
    }

    setIsLoading(true);

    try {
      const queryString = new URLSearchParams({
        source: searchParams.source.toUpperCase(),
        destination: searchParams.destination.toUpperCase(),
        date: searchParams.date,
      }).toString();

      router.push(`/search?${queryString}`);
    } catch {
      toast.error("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  const getMinDate = () => todayIST();

  return (
    <div className="w-full max-w-5xl mx-auto p-2">
      <div className="bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 rounded-[3rem] shadow-2xl shadow-blue-100/40 border border-slate-200 overflow-hidden relative">
        <div className="p-10 border-b border-slate-100 bg-gradient-to-r from-blue-100/60 via-white/80 to-slate-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-100 via-white to-slate-100 text-blue-500 rounded-3xl border border-blue-100 shadow-inner">
              <Globe className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight leading-none uppercase">
                Train <span className="text-blue-600">Search</span>
              </h2>
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                Indian Railways Search
              </p>
            </div>
          </div>
        </div>

        <div className="p-10">
          <form onSubmit={handleSearch} className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-3 group">
                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest px-1 block group-focus-within:text-blue-600 transition-colors">
                  From Station
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                    <MapPin className="h-5 w-5 text-blue-200 group-focus-within:text-blue-500 transition-colors" />
                  </div>
                  <input
                    type="text"
                    className={cn(
                      "w-full bg-gradient-to-r from-blue-50/60 via-white/80 to-slate-50/60 border-2 rounded-3xl py-5 pl-14 pr-6 text-sm font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all placeholder:text-blue-200",
                      errors.source
                        ? "border-red-500 shadow-red-50"
                        : "border-blue-100 group-hover:border-blue-200"
                    )}
                    placeholder="E.G. NDLS"
                    value={searchParams.source}
                    onChange={(e) => {
                      setSearchParams({
                        ...searchParams,
                        source: e.target.value.toUpperCase(),
                      });
                      if (errors.source) {
                        setErrors({ ...errors, source: "" });
                      }
                    }}
                  />
                </div>
                {errors.source && (
                  <p className="text-[9px] font-black text-red-500 uppercase tracking-widest px-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {errors.source}
                  </p>
                )}
              </div>

              <div className="space-y-3 group">
                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest px-1 block group-focus-within:text-blue-600 transition-colors">
                  To Station
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                    <MapPin className="h-5 w-5 text-blue-200 group-focus-within:text-blue-500 transition-colors" />
                  </div>
                  <input
                    type="text"
                    className={cn(
                      "w-full bg-gradient-to-r from-blue-50/60 via-white/80 to-slate-50/60 border-2 rounded-3xl py-5 pl-14 pr-6 text-sm font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all placeholder:text-blue-200",
                      errors.destination
                        ? "border-red-500 shadow-red-50"
                        : "border-blue-100 group-hover:border-blue-200"
                    )}
                    placeholder="E.G. BCT"
                    value={searchParams.destination}
                    onChange={(e) => {
                      setSearchParams({
                        ...searchParams,
                        destination: e.target.value.toUpperCase(),
                      });
                      if (errors.destination) {
                        setErrors({ ...errors, destination: "" });
                      }
                    }}
                  />
                </div>
                {errors.destination && (
                  <p className="text-[9px] font-black text-red-500 uppercase tracking-widest px-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {errors.destination}
                  </p>
                )}
              </div>

              <div className="space-y-3 group">
                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest px-1 block group-focus-within:text-blue-600 transition-colors">
                  Journey Date
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                    <Calendar className="h-5 w-5 text-blue-200 group-focus-within:text-blue-500 transition-colors" />
                  </div>
                  <input
                    type="date"
                    min={getMinDate()}
                    className={cn(
                      "w-full bg-gradient-to-r from-blue-50/60 via-white/80 to-slate-50/60 border-2 rounded-3xl py-5 pl-14 pr-6 text-sm font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all",
                      errors.date
                        ? "border-red-500 shadow-red-50"
                        : "border-blue-100 group-hover:border-blue-200"
                    )}
                    value={searchParams.date}
                    onChange={(e) => {
                      setSearchParams({
                        ...searchParams,
                        date: e.target.value,
                      });
                      if (errors.date) {
                        setErrors({ ...errors, date: "" });
                      }
                    }}
                  />
                </div>
                {errors.date && (
                  <p className="text-[9px] font-black text-red-500 uppercase tracking-widest px-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {errors.date}
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 via-blue-500 to-blue-400 text-white font-black uppercase tracking-[0.5em] text-[10px] py-7 px-4 rounded-[2rem] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-2xl shadow-blue-200/40 hover:from-blue-700 hover:to-blue-500 active:scale-95 group/btn"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  Search Trains
                  <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-2 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-12 p-8 bg-gradient-to-r from-blue-50 via-white to-slate-50 rounded-[2.5rem] flex flex-col md:flex-row items-center gap-8 border border-blue-100">
            <div className="text-center md:text-left">
              <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-1.5 flex items-center justify-center md:justify-start gap-1">
                <Globe className="w-3 h-3" /> Available Stations
              </p>
              <div className="flex flex-wrap gap-2">
                {STATION_CODES.map((code) => (
                  <span
                    key={code}
                    className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 inline-flex items-center gap-1.5"
                  >
                    {STATION_NAMES[code] || code}
                    <span className="text-[8px] font-mono font-bold text-blue-400 uppercase">
                      {code}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div className="hidden md:block w-[1px] h-8 bg-blue-200" />

            <div className="flex-1">
              <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest leading-relaxed">
                You can search between these stations. More routes coming soon.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
