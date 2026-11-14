
"use client";

import { API_URL } from "@/lib/constants";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Plus,
  X,
  FileText,
  User,
  ShieldCheck,
  CreditCard,
  AtSign,
  UserCheck
} from "lucide-react";
import BackButton from "@/components/BackButton";

interface Passenger {
  _id: string;
  name: string;
  age: number;
  gender: "Male" | "Female" | "Other";
  documentType: "Aadhar" | "PAN" | "Passport";
  documentNumber: string;
}

type PassengerGender = "Male" | "Female" | "Other";
type DocumentType = "Aadhar" | "PAN" | "Passport";

interface ApiErrorResponse {
  message?: string;
}

interface PassengersResponse {
  passengers?: Passenger[];
}

interface PassengerFormData {
  name: string;
  age: number;
  gender: PassengerGender;
  documentType: DocumentType;
  documentNumber: string;
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data?.message || fallback;
  }

  return fallback;
};

const SavedPassengers = () => {
  const { token } = useAuth();

  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState<PassengerFormData>({
    name: "",
    age: 18,
    gender: "Male",
    documentType: "Aadhar",
    documentNumber: "",
  });

  const fetchPassengers = useCallback(async () => {
    setLoading(true);

    try {
      const response = await axios.get<PassengersResponse>(
        `${API_URL}/users/passengers`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setPassengers(response.data.passengers || []);
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error, "Failed to fetch passengers")
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchPassengers();
  }, [fetchPassengers]);

  const handleAddPassenger = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.name || !formData.documentNumber) {
      toast.error("Please fill all fields");
      return;
    }

    try {
      await axios.post(
        `${API_URL}/users/passengers`,
        formData,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success("Passenger added successfully");
      setShowModal(false);
      setEditingId(null);

      setFormData({
        name: "",
        age: 18,
        gender: "Male",
        documentType: "Aadhar",
        documentNumber: "",
      });

      void fetchPassengers();
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error, "Failed to add passenger")
      );
    }
  };

  const handleDeletePassenger = async (passengerId: string) => {
    if (!window.confirm("Confirm permanent removal of entity from registry?")) {
      return;
    }

    try {
      await axios.delete(
        `${API_URL}/users/passengers/${passengerId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success("Record purged from registry");

      setPassengers((currentPassengers) =>
        currentPassengers.filter(
          (passenger) => passenger._id !== passengerId
        )
      );
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error, "Purge operation failed")
      );
    }
  };

  const getDocumentIcon = (type: DocumentType) => {
    switch (type) {
      case "Aadhar":
        return <AtSign className="w-3 h-3" />;
      case "PAN":
        return <CreditCard className="w-3 h-3" />;
      case "Passport":
        return <ShieldCheck className="w-3 h-3" />;
      default:
        return <FileText className="w-3 h-3" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <BackButton />

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
              Verified Identity Vault
            </span>
          </div>
        </div>

        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 mb-2">
              Passenger <span className="text-blue-600">Registry</span>
            </h1>

            <p className="text-slate-500 font-medium">
              Manage and audit linked traveler identities for instant booking
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-6 py-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all font-black uppercase tracking-widest text-[10px] shadow-xl shadow-slate-200"
          >
            <Plus className="w-4 h-4" />
            Add Entity
          </button>
        </header>

        <div className="relative">
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-6 bg-white rounded-[2rem] border border-slate-200">
              <div className="w-16 h-16 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                Accessing Registry Data...
              </p>
            </div>
          ) : passengers.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-[2rem] border border-slate-200 p-20 text-center shadow-sm"
            >
              <Users className="w-20 h-20 text-slate-100 mx-auto mb-6" />

              <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">
                Registry Empty
              </h3>

              <p className="text-slate-400 font-medium max-w-xs mx-auto mb-10 text-sm leading-relaxed">
                No travelers are currently mapped to your account node.
              </p>

              <button
                onClick={() => setShowModal(true)}
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                Initialize First Entity
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {passengers.map((passenger, index) => (
                  <motion.div
                    key={passenger._id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white rounded-[2rem] border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-50 transition-all group overflow-hidden"
                  >
                    <div className="p-8">
                      <div className="flex items-center gap-5 mb-8">
                        <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shadow-inner">
                          <User className="w-7 h-7" />
                        </div>

                        <div>
                          <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none mb-1 group-hover:text-blue-600 transition-colors">
                            {passenger.name}
                          </h3>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              {passenger.gender} • {passenger.age} YRS
                            </span>

                            <div className="w-1 h-1 bg-slate-200 rounded-full" />

                            <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">
                              Active Member
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-8">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5 text-slate-400">
                            {getDocumentIcon(passenger.documentType)}

                            <span className="text-[9px] font-black uppercase tracking-widest">
                              {passenger.documentType} REF
                            </span>
                          </div>

                          <span className="text-[8px] font-black text-green-600 bg-white px-2 py-0.5 rounded border border-green-50 uppercase tracking-tighter">
                            Verified
                          </span>
                        </div>

                        <p className="text-sm font-mono font-black text-slate-700 tracking-tighter">
                          {passenger.documentNumber}
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => setEditingId(passenger._id)}
                          className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-400 hover:border-blue-500 hover:text-blue-600 rounded-xl transition-all font-black uppercase tracking-widest text-[9px] active:scale-95"
                        >
                          Modify
                        </button>

                        <button
                          onClick={() => handleDeletePassenger(passenger._id)}
                          className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-400 hover:border-red-500 hover:text-red-600 rounded-xl transition-all font-black uppercase tracking-widest text-[9px] active:scale-95"
                        >
                          Purge
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
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
                className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden"
              >
                <div className="flex items-center justify-between p-8 border-b border-slate-50">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                      {editingId ? "Update Entity" : "New Entity"}
                    </h2>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                      Registry Entry Protocol
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setShowModal(false);
                      setEditingId(null);
                    }}
                    className="p-3 bg-slate-50 text-slate-400 hover:text-slate-800 rounded-2xl transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddPassenger} className="p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      Legal Designation
                    </label>

                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="FULL NAME AS PER GOVT ID"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Current Age
                      </label>

                      <input
                        type="number"
                        value={formData.age}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            age: Number.parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Gender
                      </label>

                      <select
                        value={formData.gender}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            gender: e.target.value as PassengerGender,
                          })
                        }
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      ID Protocol
                    </label>

                    <select
                      value={formData.documentType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          documentType: e.target.value as DocumentType,
                        })
                      }
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="Aadhar">Aadhar Registry</option>
                      <option value="PAN">PAN Registry</option>
                      <option value="Passport">Passport Registry</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      Credential Number
                    </label>

                    <input
                      type="text"
                      value={formData.documentNumber}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          documentNumber: e.target.value,
                        })
                      }
                      placeholder="ENTER ID NUMBER"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 mt-4 active:scale-95"
                  >
                    {editingId ? "Update Registry Record" : "Append to Registry"}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SavedPassengers;
