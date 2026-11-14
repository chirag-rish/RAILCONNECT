
"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReactNode, MouseEventHandler } from "react";
import BackButton from "@/components/BackButton";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import { API_URL } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import AIAssistantWidget from "@/components/AIAssistantWidget";
import Link from "next/link";
import {
  Search,
  Check,
  Ticket,
  UserCheck,
  AlertCircle,
  QrCode,
  ClipboardList,
  Train as TrainIcon,
  ShieldCheck,
  Bot
} from "lucide-react";

interface Train {
  _id: string;
  trainNumber: string;
  name: string;
}

interface Passenger {
  _id: string;
  name: string;
  gender: string;
  age: number;
  assigned_seat?: string;
  boarded: boolean;
}

interface Booking {
  _id: string;
  pnr: string;
  status: string;
  journeyDate: string;
  travelClass: string;
  train?: {
    name?: string;
    trainNumber?: string;
  };
  passengers: Passenger[];
}

interface ManifestPassenger {
  passengerId: string;
  bookingId: string;
  seat: string;
  name: string;
  gender: string;
  age: number;
  pnr: string;
  status: string;
  boarded: boolean;
  coach: string;
}

interface BoardingResponse {
  message: string;
  passenger: Passenger;
}

interface ApiErrorResponse {
  message?: string;
  booking?: Booking;
}

interface TabButtonProps {
  active: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  icon: ReactNode;
  label: string;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data?.message || fallback;
  }

  return fallback;
}

export default function TTEPortal() {
  const { user, token, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"verify" | "manifest">("verify");
  const [pnrInput, setPnrInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [scannedResult, setScannedResult] = useState<Booking | null>(null);

  const [trains, setTrains] = useState<Train[]>([]);
  const [selectedTrain, setSelectedTrain] = useState("");
  const [manifest, setManifest] = useState<ManifestPassenger[]>([]);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState("All");

  const fetchTrains = useCallback(async () => {
    try {
      const response = await axios.get<Train[]>(`${API_URL}/trains`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setTrains(response.data);
    } catch {
      toast.error("Failed to load duty train list");
    }
  }, [token]);

  useEffect(() => {
    if (authLoading) return;

    if (!token) {
      router.push("/login?redirect=/tte");
      return;
    }

    if (user?.role !== "tte" && user?.role !== "admin") {
      toast.error("Access denied. TTE credentials required.");
      router.push("/user/dashboard");
      return;
    }

    fetchTrains();
  }, [authLoading, token, user, router, fetchTrains]);

  const fetchManifest = async (trainId: string) => {
    const url = `${API_URL}/tte/train/${trainId}/passengers`;

    console.log(`[DEBUG] Fetching manifest: ${url}`);
    setManifestLoading(true);

    try {
      const response = await axios.get<ManifestPassenger[]>(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setManifest(response.data);
    } catch (error: unknown) {
      toast.error(
        getApiErrorMessage(
          error,
          "Manifest Error: Failed to fetch passengers"
        )
      );
    } finally {
      setManifestLoading(false);
    }
  };

  const handleVerifyPNR = async () => {
    if (!pnrInput || pnrInput.length < 5) return;

    const url = `${API_URL}/tte/verify/${pnrInput}`;

    console.log(`[DEBUG] Verifying PNR: ${url}`);
    setVerifying(true);
    setScannedResult(null);

    try {
      const response = await axios.get<{ message: string; booking: Booking }>(
        url,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setScannedResult(response.data.booking);
      toast.success("Ticket Verification Complete");
    } catch (error: unknown) {
      if (axios.isAxiosError<ApiErrorResponse>(error)) {
        const booking = error.response?.data?.booking;

        if (booking) {
          setScannedResult(booking);
          toast.error(
            error.response?.data?.message || "Ticket is Cancelled/Invalid"
          );
        } else {
          toast.error(
            error.response?.data?.message ||
              "Verification Error: Invalid PNR format"
          );
          setScannedResult(null);
        }
      } else {
        toast.error("Verification Error: Invalid PNR format");
        setScannedResult(null);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleToggleBoarding = async (
    bookingId: string,
    passengerId: string
  ) => {
    try {
      const response = await axios.patch<BoardingResponse>(
        `${API_URL}/tte/board/${bookingId}/${passengerId}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success(response.data.message);

      if (scannedResult && scannedResult._id === bookingId) {
        setScannedResult((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            passengers: prev.passengers.map((passenger) =>
              passenger._id === passengerId
                ? response.data.passenger
                : passenger
            )
          };
        });
      }

      setManifest((prev) =>
        prev.map((passenger) =>
          passenger.passengerId === passengerId
            ? {
                ...passenger,
                boarded: response.data.passenger.boarded
              }
            : passenger
        )
      );
    } catch (error: unknown) {
      toast.error(
        getApiErrorMessage(
          error,
          "Update Error: Failed to change boarding status"
        )
      );
    }
  };

  const coaches = [
    "All",
    ...new Set(manifest.map((passenger) => passenger.coach))
  ].sort();

  const filteredManifest =
    selectedCoach === "All"
      ? manifest
      : manifest.filter((passenger) => passenger.coach === selectedCoach);

  if (authLoading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 text-blue-100 font-sans">
      <nav className="bg-gradient-to-r from-blue-900 to-indigo-900 border-b border-blue-900 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-blue-800/60 p-2 rounded-lg shadow-md backdrop-blur-sm">
            <ShieldCheck className="w-6 h-6 text-blue-200" />
          </div>

          <div>
            <h1 className="font-bold text-xl tracking-tight text-blue-100">
              RailConnect{" "}
              <span className="text-blue-400 font-medium">STAFF</span>
            </h1>
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em]">
              Live Duty Terminal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <p className="text-sm font-bold text-blue-200">{user?.name}</p>
            <p className="text-[10px] text-blue-400 font-mono font-bold tracking-tighter">
              OFFICER ID: TTE-{user?._id?.slice(-6).toUpperCase()}
            </p>
          </div>

          <Link href="/ai-assistant">
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-800 hover:bg-blue-700 border border-blue-900 rounded-xl text-blue-100 font-bold text-sm uppercase tracking-wider transition-all backdrop-blur-sm shadow-lg hover:shadow-xl">
              <Bot className="w-5 h-5 text-blue-300" />
              <span className="hidden lg:inline">AI Assistant</span>
            </button>
          </Link>

          <div className="h-10 w-10 rounded-full bg-blue-800 border border-blue-900 flex items-center justify-center text-blue-100 font-bold shadow-sm backdrop-blur-sm">
            {user?.name?.[0]}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 md:p-8 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 rounded-xl shadow-xl">
        <BackButton />
        <AIAssistantWidget variant="floating" />

        <div className="flex gap-1 bg-blue-50/60 p-1 rounded-xl w-fit mb-8 border border-blue-100">
          <TabButton
            active={activeTab === "verify"}
            onClick={() => setActiveTab("verify")}
            icon={<QrCode className="w-4 h-4" />}
            label="Verify PNR"
          />

          <TabButton
            active={activeTab === "manifest"}
            onClick={() => setActiveTab("manifest")}
            icon={<ClipboardList className="w-4 h-4" />}
            label="Duty Manifest"
          />
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "verify" ? (
            <motion.div
              key="verify-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-gradient-to-br from-blue-50 via-white to-slate-100 border border-blue-100 rounded-2xl p-8 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-600" />
                  Quick PNR Search
                </h2>

                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Enter 10-digit PNR"
                      value={pnrInput}
                      onChange={(e) => setPnrInput(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleVerifyPNR()
                      }
                      className="w-full bg-blue-50 border border-blue-200 text-blue-900 rounded-xl px-4 py-4 pl-12 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all font-mono text-lg tracking-[0.2em]"
                    />

                    <Ticket className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 w-5 h-5" />
                  </div>

                  <button
                    onClick={handleVerifyPNR}
                    disabled={verifying}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2 min-w-[160px]"
                  >
                    {verifying ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" />
                    ) : (
                      "Verify Ticket"
                    )}
                  </button>
                </div>
              </div>

              {scannedResult && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-gradient-to-br from-blue-50 via-white to-slate-100 border border-blue-100 rounded-2xl overflow-hidden shadow-sm"
                >
                  <div
                    className={`p-4 ${
                      scannedResult.status === "Cancelled"
                        ? "bg-red-100 border-b border-red-200"
                        : "bg-green-100 border-b border-green-200"
                    } flex items-center justify-between`}
                  >
                    <div className="flex items-center gap-2">
                      {scannedResult.status === "Cancelled" ? (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      ) : (
                        <UserCheck className="w-5 h-5 text-green-600" />
                      )}

                      <span
                        className={`font-bold uppercase tracking-widest text-xs ${
                          scannedResult.status === "Cancelled"
                            ? "text-red-700"
                            : "text-green-700"
                        }`}
                      >
                        {scannedResult.status === "Cancelled"
                          ? "Ticket VOID / Cancelled"
                          : "Ticket VALID / Confirmed"}
                      </span>
                    </div>

                    <span className="text-slate-500 font-mono text-xs font-bold uppercase tracking-widest">
                      PNR: {scannedResult.pnr}
                    </span>
                  </div>

                  <div className="p-8">
                    <div className="grid md:grid-cols-5 gap-10">
                      <div className="md:col-span-2 space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="bg-blue-100 p-3 rounded-xl border border-blue-200 shadow-inner">
                            <TrainIcon className="w-6 h-6 text-blue-700" />
                          </div>

                          <div>
                            <p className="text-blue-400 text-[10px] font-bold uppercase tracking-widest leading-none mb-1">
                              Service
                            </p>

                            <p className="text-lg font-bold text-blue-900 leading-none">
                              {scannedResult.train?.name || "Unknown Train"}
                              <span className="text-blue-600 ml-1">
                                #{scannedResult.train?.trainNumber || ""}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <p className="text-blue-400 text-[10px] font-bold uppercase mb-1">
                              Journey Date
                            </p>
                            <p className="text-sm font-bold text-blue-900">
                              {new Date(
                                scannedResult.journeyDate
                              ).toLocaleDateString(undefined, {
                                dateStyle: "medium"
                              })}
                            </p>
                          </div>

                          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <p className="text-blue-400 text-[10px] font-bold uppercase mb-1">
                              Class
                            </p>
                            <p className="text-sm font-bold text-blue-600">
                              {scannedResult.travelClass}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-3 space-y-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                          Verified Units ({scannedResult.passengers?.length ?? 0})
                        </p>

                        {(scannedResult.passengers ?? []).map((passenger) => (
                          <div
                            key={passenger._id}
                            className="bg-gradient-to-br from-blue-50 via-white to-slate-100 p-4 rounded-xl border border-blue-100 flex items-center justify-between shadow-sm hover:border-blue-300 transition-colors"
                          >
                            <div>
                              <p className="text-blue-900 font-bold text-base leading-tight uppercase">
                                {passenger.name}
                                <span className="text-blue-400 font-medium text-xs ml-1">
                                  · {passenger.gender?.[0] || "-"} / {passenger.age}
                                </span>
                              </p>

                              <p className="text-blue-600 text-xs font-mono font-bold mt-1 tracking-widest">
                                {passenger.assigned_seat || "WL/RAC"}
                              </p>
                            </div>

                            <div>
                              <button
                                onClick={() =>
                                  handleToggleBoarding(
                                    scannedResult._id,
                                    passenger._id
                                  )
                                }
                                disabled={scannedResult.status === "Cancelled"}
                                className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                                  passenger.boarded
                                    ? "bg-green-200 text-green-700 border border-green-300 shadow-sm"
                                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200"
                                } disabled:opacity-50`}
                              >
                                {passenger.boarded ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    BOARDED
                                  </>
                                ) : (
                                  "MARK BOARDED"
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="manifest-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row gap-6 items-end">
                <div className="flex-1 space-y-2 w-full">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] px-1">
                    Train Service Registry
                  </label>

                  <div className="relative">
                    <select
                      value={selectedTrain}
                      onChange={(e) => {
                        setSelectedTrain(e.target.value);

                        if (e.target.value) {
                          fetchManifest(e.target.value);
                        } else {
                          setManifest([]);
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-4 py-3.5 focus:border-blue-600 outline-none appearance-none font-bold"
                    >
                      <option value="">Select current duty train...</option>

                      {trains.map((train) => (
                        <option key={train._id} value={train._id}>
                          {train.trainNumber} - {train.name}
                        </option>
                      ))}
                    </select>

                    <TrainIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="w-full md:w-56 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] px-1">
                    Coach Filtering
                  </label>

                  <select
                    value={selectedCoach}
                    onChange={(e) => setSelectedCoach(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-4 py-3.5 focus:border-blue-600 outline-none appearance-none font-bold"
                  >
                    {coaches.map((coach) => (
                      <option key={coach} value={coach}>
                        {coach === "All"
                          ? "Complete Train Chart"
                          : `Coach: ${coach}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-12 text-[10px] font-bold text-slate-400 uppercase tracking-widest px-6 italic">
                  <div className="col-span-1">UNIT</div>
                  <div className="col-span-4">IDENTIFICATION</div>
                  <div className="col-span-2 text-center">TICKET REF</div>
                  <div className="col-span-2 text-center">VAL. STATUS</div>
                  <div className="col-span-3 text-right">DUTY ACTION</div>
                </div>

                {manifestLoading ? (
                  <div className="p-16 text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-blue-600 mx-auto mb-4" />
                    <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">
                      Compiling Manifest Registry...
                    </p>
                  </div>
                ) : filteredManifest.length === 0 ? (
                  <div className="p-16 text-center text-slate-400 border-t border-slate-100">
                    <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-5" />
                    <p className="font-bold uppercase tracking-widest text-xs">
                      No active duty records found
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredManifest.map((passenger) => (
                      <div
                        key={passenger.passengerId}
                        className="grid grid-cols-12 items-center px-6 py-5 hover:bg-slate-50 transition-colors group"
                      >
                        <div className="col-span-1">
                          <span className="bg-slate-100 text-slate-700 text-xs font-mono font-bold px-2 py-1.5 rounded border border-slate-200 shadow-sm group-hover:border-blue-300 group-hover:text-blue-600 transition-colors uppercase">
                            {passenger.seat}
                          </span>
                        </div>

                        <div className="col-span-4 pl-4 border-l border-slate-100 ml-2">
                          <p className="text-base font-bold text-slate-800 tracking-tight uppercase leading-none mb-1">
                            {passenger.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">
                            {passenger.gender} / {passenger.age} YRS
                          </p>
                        </div>

                        <div className="col-span-2 text-center text-xs font-mono font-bold text-slate-500 uppercase">
                          {passenger.pnr}
                        </div>

                        <div className="col-span-2 text-center">
                          <span
                            className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                              passenger.status === "CNF"
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {passenger.status === "CNF"
                              ? "Confirmed"
                              : passenger.status}
                          </span>
                        </div>

                        <div className="col-span-3 text-right">
                          <button
                            onClick={() =>
                              handleToggleBoarding(
                                passenger.bookingId,
                                passenger.passengerId
                              )
                            }
                            className={`px-4 py-2 rounded-lg text-[10px] font-extrabold transition-all ${
                              passenger.boarded
                                ? "bg-green-100 text-green-700 border border-green-200 shadow-sm"
                                : "bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 border border-slate-200 hover:border-blue-600"
                            }`}
                          >
                            {passenger.boarded ? (
                              <span className="flex items-center gap-1.5 justify-center">
                                <Check className="w-3.5 h-3.5" />
                                BOARDED
                              </span>
                            ) : (
                              "MARK BOARDED"
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
        active
          ? "bg-white text-blue-600 shadow-sm border border-slate-200"
          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="animate-spin rounded-full h-14 w-14 border-4 border-slate-200 border-t-blue-600 shadow-lg shadow-blue-100" />
        <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px]">
          Authorizing Duty Terminal...
        </p>
      </div>
    </div>
  );
}
