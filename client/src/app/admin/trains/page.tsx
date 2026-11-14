
"use client";

import { API_URL } from "@/lib/constants";
import { useState, useEffect, useCallback, type FormEvent, type ReactNode, type InputHTMLAttributes } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Train,
  Plus,
  Edit2,
  Trash2,
  X,
  Clock,
  MapPin,
  Search,
  CheckCircle,
  XCircle,
  ShieldCheck,
  TrendingUp,
  LayoutGrid,
  Filter,
  Activity
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { cn } from "@/utils/cn";
import { useRouter } from "next/navigation";

type TrainType =
  | "Express"
  | "Superfast"
  | "Shatabdi"
  | "Rajdhani"
  | "Duronto"
  | "Local"
  | "Mail/Express";

interface TrainData {
  _id: string;
  trainNumber: string;
  name: string;
  source: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  distance: number;
  baseFare: number;
  status: string;
  type: string;
  daysOfOperation: string[];
  liveStatus?: string;
}

interface TrainFormData {
  trainNumber: string;
  name: string;
  source: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  distance: number;
  baseFare: number;
  status: string;
  type: TrainType;
  daysOfOperation: string[];
}

interface ApiErrorResponse {
  message?: string;
}

interface InventoryMetricProps {
  label: string;
  value: number;
  icon: ReactNode;
}

interface InventoryDetailProps {
  label: string;
  value: string | number;
  icon: ReactNode;
}

interface FormInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
}

const initialFormData: TrainFormData = {
  trainNumber: "",
  name: "",
  source: "",
  destination: "",
  departureTime: "",
  arrivalTime: "",
  distance: 0,
  baseFare: 0,
  status: "Active",
  type: "Express",
  daysOfOperation: [],
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data?.message || fallback;
  }

  return fallback;
};

export default function AdminTrains() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [trains, setTrains] = useState<TrainData[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formData, setFormData] = useState<TrainFormData>(initialFormData);

  const fetchTrains = useCallback(async () => {
    try {
      setLoading(true);
      setErrorState(false);

      const response = await axios.get<TrainData[]>(`${API_URL}/trains`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setTrains(response.data);
    } catch (error: unknown) {
      setErrorState(true);
      toast.error(getErrorMessage(error, "Failed to sync inventory registry"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/login");
      return;
    }

    void fetchTrains();
  }, [user, router, fetchTrains]);

  const resetForm = () => {
    setFormData({ ...initialFormData, daysOfOperation: [] });
  };

  const handleSaveTrain = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      if (editingId) {
        await axios.put(
          `${API_URL}/trains/${editingId}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        toast.success("Inventory record updated");
      } else {
        await axios.post(`${API_URL}/trains`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });

        toast.success("New asset added to registry");
      }

      setShowModal(false);
      setEditingId(null);
      resetForm();
      await fetchTrains();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Operation failed"));
    }
  };

  const handleDeleteTrain = async (id: string) => {
    if (!window.confirm("Confirm permanent removal of asset from national registry?")) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/trains/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success("Asset purged from registry");
      await fetchTrains();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Purge operation failed"));
    }
  };

  const filteredTrains = trains.filter((train) => {
    const query = searchQuery.toLowerCase();

    const matchesSearch =
      train.name?.toLowerCase().includes(query) ||
      train.trainNumber?.toLowerCase().includes(query) ||
      train.source?.toLowerCase().includes(query) ||
      train.destination?.toLowerCase().includes(query);

    const normalizedStatus = train.status?.toLowerCase() || "";

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" &&
        ["active", "activ", "ontime", "on time", "delayed"].includes(normalizedStatus)) ||
      (statusFilter === "inactive" &&
        ["inactive", "decommissioned", "cancelled"].includes(normalizedStatus));

    const matchesType =
      typeFilter === "all" ||
      train.type?.toLowerCase() === typeFilter.toLowerCase();

    return matchesSearch && matchesStatus && matchesType;
  });

  const activeFleetCount = trains.filter(
    (train) =>
      !["inactive", "cancelled", "decommissioned"].includes(
        train.status?.toLowerCase()
      )
  ).length;

  const premiumAssetsCount = trains.filter(
    (train) => ["Rajdhani", "Shatabdi", "Duronto"].includes(train.type)
  ).length;

  if (loading && trains.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
          Querying Inventory Hub...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <BackButton />

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
              Admin Logistics Terminal
            </span>
          </div>
        </div>

        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 mb-2">
              Train <span className="text-blue-600">Inventory</span>
            </h1>
            <p className="text-slate-500 font-medium">
              Rolling stock registry and service corridor management
            </p>
          </div>

          <button
            onClick={() => {
              setEditingId(null);
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-6 py-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all font-black uppercase tracking-widest text-[10px] shadow-xl shadow-slate-200"
          >
            <Plus className="w-4 h-4" />
            Initialize Asset
          </button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          <InventoryMetric
            label="Active Fleet"
            value={activeFleetCount}
            icon={<Activity className="w-4 h-4" />}
          />

          <InventoryMetric
            label="Service Corridors"
            value={trains.length}
            icon={<LayoutGrid className="w-4 h-4" />}
          />

          <InventoryMetric
            label="Premium Assets"
            value={premiumAssetsCount}
            icon={<TrendingUp className="w-4 h-4 text-blue-600" />}
          />

          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-center">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">
              Registry Health
            </p>

            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  errorState ? "bg-red-500" : "bg-green-500"
                )}
              />

              <span className="text-xs font-black text-slate-700 uppercase">
                {errorState ? "Sync Failed" : "Synchronized"}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-8 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

            <input
              type="text"
              placeholder="Search by train name, number, source or destination..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
              <Filter className="w-4 h-4 text-slate-400" />

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer uppercase"
              >
                <option value="all">All Status</option>
                <option value="active">Operational</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer uppercase"
              >
                <option value="all">All Types</option>
                <option value="Express">Express</option>
                <option value="Superfast">Superfast</option>
                <option value="Rajdhani">Rajdhani</option>
                <option value="Shatabdi">Shatabdi</option>
                <option value="Duronto">Duronto</option>
                <option value="Local">Local</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <AnimatePresence>
            {filteredTrains.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-[2rem] border border-slate-200 p-20 text-center shadow-sm"
              >
                <Train className="w-20 h-20 text-slate-100 mx-auto mb-6" />

                <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">
                  No Matching Assets
                </h3>

                <p className="text-slate-400 font-medium max-w-xs mx-auto text-sm leading-relaxed">
                  No rolling stock matches your filter criteria in the registry hub.
                </p>
              </motion.div>
            ) : (
              filteredTrains.map((train, index) => (
                <motion.div
                  key={train._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-[2.5rem] p-8 border border-slate-200 hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-50 transition-all group overflow-hidden relative"
                >
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                    <div className="flex items-center gap-6 flex-1">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shadow-inner">
                        <Train className="w-8 h-8" />
                      </div>

                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-600 transition-colors leading-none">
                            {train.name}
                          </h3>

                          <span className="bg-slate-50 text-slate-400 text-[10px] font-black px-2 py-0.5 rounded border border-slate-100 tracking-tighter shadow-sm">
                            #{train.trainNumber}
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {train.type} Service
                          </span>

                          <div className="w-1 h-1 bg-slate-200 rounded-full" />

                          <div
                            className={cn(
                              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                              !["inactive", "cancelled", "decommissioned"].includes(
                                (train.status || "").toLowerCase()
                              )
                                ? "bg-green-50 text-green-600 border-green-100"
                                : "bg-red-50 text-red-600 border-red-100"
                            )}
                          >
                            {!["inactive", "cancelled", "decommissioned"].includes(
                              (train.status || "").toLowerCase()
                            ) ? (
                              <CheckCircle className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}

                            {train.status || "Active"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 flex-[2]">
                      <InventoryDetail
                        label="Corridor"
                        value={`${train.source} ➔ ${train.destination}`}
                        icon={<MapPin className="w-3.5 h-3.5" />}
                      />

                      <InventoryDetail
                        label="Departure"
                        value={train.departureTime}
                        icon={<Clock className="w-3.5 h-3.5" />}
                      />

                      <InventoryDetail
                        label="Arrival"
                        value={train.arrivalTime}
                        icon={<Clock className="w-3.5 h-3.5" />}
                      />

                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">
                          Base Fare
                        </p>
                        <p className="text-2xl font-black text-slate-800 tracking-tighter">
                          ₹{train.baseFare}
                        </p>
                      </div>
                    </div>

                    <div className="flex lg:flex-col gap-3">
                      <button
                        onClick={() => {
                          setEditingId(train._id);
                          setFormData({
                            trainNumber: train.trainNumber,
                            name: train.name,
                            source: train.source,
                            destination: train.destination,
                            departureTime: train.departureTime,
                            arrivalTime: train.arrivalTime,
                            distance: train.distance,
                            baseFare: train.baseFare,
                            status: train.status || "Active",
                            type: (train.type as TrainType) || "Express",
                            daysOfOperation: train.daysOfOperation || [],
                          });
                          setShowModal(true);
                        }}
                        className="p-3 bg-white border border-slate-100 text-slate-300 hover:border-blue-500 hover:text-blue-600 rounded-xl transition-all shadow-sm active:scale-95 group/btn"
                        title="Edit Asset"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteTrain(train._id)}
                        className="p-3 bg-white border border-slate-100 text-slate-300 hover:border-red-500 hover:text-red-600 rounded-xl transition-all shadow-sm active:scale-95"
                        title="Purge Asset"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-6"
              onClick={() => setShowModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-[2.5rem] shadow-2xl max-w-2xl w-full overflow-hidden"
              >
                <div className="flex items-center justify-between p-8 border-b border-slate-50">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none">
                      {editingId ? "Modify Asset" : "New Inventory Asset"}
                    </h2>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                      Rolling Stock Entry Protocol
                    </p>
                  </div>

                  <button
                    onClick={() => setShowModal(false)}
                    className="p-3 bg-slate-50 text-slate-400 hover:text-slate-800 rounded-2xl transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveTrain} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormInput
                      label="Registry Code"
                      value={formData.trainNumber}
                      onChange={(value) => setFormData({ ...formData, trainNumber: value })}
                      placeholder="E.G. 12951"
                    />

                    <FormInput
                      label="Official Designation"
                      value={formData.name}
                      onChange={(value) => setFormData({ ...formData, name: value })}
                      placeholder="E.G. RAJDHANI EXPRESS"
                    />

                    <FormInput
                      label="Node Origin"
                      value={formData.source}
                      onChange={(value) => setFormData({ ...formData, source: value })}
                      placeholder="NDLS"
                    />

                    <FormInput
                      label="Node Destination"
                      value={formData.destination}
                      onChange={(value) => setFormData({ ...formData, destination: value })}
                      placeholder="BCT"
                    />

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Departure Logic
                      </label>

                      <input
                        type="time"
                        value={formData.departureTime}
                        onChange={(e) => setFormData({ ...formData, departureTime: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Arrival Logic
                      </label>

                      <input
                        type="time"
                        value={formData.arrivalTime}
                        onChange={(e) => setFormData({ ...formData, arrivalTime: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Corridor Span (KM)
                      </label>

                      <input
                        type="number"
                        value={formData.distance || ""}
                        onChange={(e) => setFormData({ ...formData, distance: Number.parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Baseline Valuation (₹)
                      </label>

                      <input
                        type="number"
                        value={formData.baseFare || ""}
                        onChange={(e) => setFormData({ ...formData, baseFare: Number.parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Service Class
                      </label>

                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value as TrainType })}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                      >
                        {["Express", "Superfast", "Shatabdi", "Rajdhani", "Duronto", "Local", "Mail/Express"].map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Inventory Status
                      </label>

                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                      >
                        <option value="Active">Operational (Active)</option>
                        <option value="Inactive">Decommissioned (Inactive)</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Delayed">Delayed</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      Operation Cycle
                    </label>

                    <div className="flex flex-wrap gap-2">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            const days = formData.daysOfOperation;
                            const newDays = days.includes(day)
                              ? days.filter((currentDay) => currentDay !== day)
                              : [...days, day];

                            setFormData({ ...formData, daysOfOperation: newDays });
                          }}
                          className={cn(
                            "px-4 py-2 text-[10px] font-black rounded-xl border-2 transition-all uppercase tracking-widest",
                            formData.daysOfOperation.includes(day)
                              ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-100"
                              : "bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-300"
                          )}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 mt-4 active:scale-95"
                  >
                    {editingId ? "Update Registry Asset" : "Append Asset to Registry"}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-12 text-center">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em]">
            SYSTEM LOGISTICS REGISTRY • TOTAL ASSETS: {trains.length}
          </p>
        </div>
      </div>
    </div>
  );
}

function InventoryMetric({ label, value, icon }: InventoryMetricProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm group hover:border-blue-400 transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-slate-50 rounded-xl text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
          {icon}
        </div>

        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
          {label}
        </p>
      </div>

      <p className="text-3xl font-black text-slate-800 tracking-tighter group-hover:text-blue-600 transition-colors">
        {value}
      </p>
    </div>
  );
}

function InventoryDetail({ label, value, icon }: InventoryDetailProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1 flex items-center gap-1">
        {icon} {label}
      </p>

      <p className="text-sm font-black text-slate-700 uppercase tracking-tight truncate">
        {value}
      </p>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: FormInputProps) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-300"
        required
      />
    </div>
  );
}
