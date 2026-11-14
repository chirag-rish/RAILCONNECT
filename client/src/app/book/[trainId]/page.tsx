
"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/constants";
import { toast } from "react-hot-toast";
import {
  User,
  Plus,
  Trash2,
  ShieldCheck,
  Calendar,
  Train,
  ChevronRight,
  Shield,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BackButton from "@/components/BackButton";

interface Passenger {
  name: string;
  age: string;
  gender: string;
  berthPreference: string;
}

type PassengerField = keyof Passenger;

interface TrainData {
  _id: string;
  trainNumber: string;
  name: string;
  baseFare?: number;
}

interface FareDetails {
  baseFarePerPassenger: number;
  subtotal: number;
  gst: number;
  totalFare: number;
}

interface FareResponse {
  fare?: FareDetails;
}

interface BookingResponse {
  booking: {
    _id: string;
  };
}

interface ApiErrorResponse {
  message?: string;
}

export default function BookingPage() {
  const { trainId } = useParams<{ trainId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const travelClass = searchParams.get("class") || "SL";
  const journeyDate = searchParams.get("date");

  const [passengers, setPassengers] = useState<Passenger[]>([
    {
      name: "",
      age: "",
      gender: "Male",
      berthPreference: "No Preference",
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [train, setTrain] = useState<TrainData | null>(null);
  const [loadingTrain, setLoadingTrain] = useState(true);
  const [fareDetails, setFareDetails] = useState<FareDetails | null>(null);

  useEffect(() => {
    if (!user || !train) return;

    const fetchFare = async () => {
      try {
        const config = {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        };

        const { data } = await axios.get<FareResponse>(
          `${API_URL}/bookings/calculate-fare?trainId=${train._id}&travelClass=${travelClass}&passengerCount=${passengers.length}`,
          config
        );

        setFareDetails(data.fare || null);
      } catch (error: unknown) {
        console.error("Failed to fetch dynamic fare", error);
      }
    };

    fetchFare();
  }, [user, train, travelClass, passengers.length]);

  useEffect(() => {
    if (!isAuthLoading && !user) {
      toast.error("Please login to book tickets");
      router.push("/login");
      return;
    }

    const fetchTrain = async () => {
      try {
        const config = {
          headers: {
            Authorization: `Bearer ${user?.token}`,
          },
        };

        const { data } = await axios.get<TrainData[]>(
          `${API_URL}/trains`,
          config
        );

        const found = data.find(
          (item) =>
            item._id === trainId || item.trainNumber === trainId
        );

        if (found) {
          setTrain(found);
        }
      } catch (error: unknown) {
        console.error("Failed to load train info", error);
      } finally {
        setLoadingTrain(false);
      }
    };

    if (user) {
      fetchTrain();
    }
  }, [isAuthLoading, user, router, trainId]);

  const handleAddPassenger = () => {
    setPassengers((previous) => [
      ...previous,
      {
        name: "",
        age: "",
        gender: "Male",
        berthPreference: "No Preference",
      },
    ]);
  };

  const handleRemovePassenger = (index: number) => {
    setPassengers((previous) =>
      previous.length > 1
        ? previous.filter((_, passengerIndex) => passengerIndex !== index)
        : previous
    );
  };

  const handlePassengerChange = (
    index: number,
    field: PassengerField,
    value: string
  ) => {
    setPassengers((previous) =>
      previous.map((passenger, passengerIndex) =>
        passengerIndex === index
          ? { ...passenger, [field]: value }
          : passenger
      )
    );
  };

  const handleBooking = async () => {
    try {
      if (!passengers.every((passenger) => passenger.name.trim())) {
        toast.error("Please enter name for all passengers");
        return;
      }

      if (!passengers.every((passenger) => passenger.age)) {
        toast.error("Please enter age for all passengers");
        return;
      }

      setIsSubmitting(true);

      const token = user?.token;

      if (!token) {
        toast.error("Authentication token missing. Please login again.");
        router.push("/login");
        return;
      }

      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };

      const bookingData = {
        trainId: train?._id,
        journeyDate,
        travelClass,
        passengers: passengers.map((passenger) => ({
          name: passenger.name.trim(),
          age: parseInt(passenger.age, 10),
          gender: passenger.gender,
        })),
        contactDetails: {
          mobile: user?.mobile || "N/A",
          email: user?.email || "",
        },
      };

      const { data } = await axios.post<BookingResponse>(
        `${API_URL}/bookings`,
        bookingData,
        config
      );

      toast.success("Booking Confirmed! PNR Generated.");
      router.push(`/booking/confirmed/${data.booking._id}`);
    } catch (error: unknown) {
      const errorMsg = axios.isAxiosError<ApiErrorResponse>(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : "Transaction Failed";

      toast.error(errorMsg || "Transaction Failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getClassMultiplier = (classType: string) => {
    const multipliers: Record<string, number> = {
      "1A": 2,
      "2A": 1.5,
      CC: 1,
      SL: 1,
      "2S": 1,
      EC: 2,
      "3A": 1.2,
      AC2: 1.5,
    };

    return multipliers[classType] || 1;
  };

  const multiplier = getClassMultiplier(travelClass);

  const baseFarePerPassenger = fareDetails
    ? fareDetails.baseFarePerPassenger
    : Math.round((train?.baseFare || 900) * multiplier);

  const baseFareSubtotal = fareDetails
    ? fareDetails.subtotal
    : baseFarePerPassenger * passengers.length;

  const gstAmountTotal = fareDetails
    ? fareDetails.gst
    : Math.round(baseFareSubtotal * 0.18);

  const totalFare = fareDetails
    ? fareDetails.totalFare
    : baseFareSubtotal + gstAmountTotal;

  if (isAuthLoading || !user || loadingTrain) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
          Verifying your login...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <BackButton />

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
              Secure Checkout
            </span>
          </div>
        </div>

        <header className="mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 mb-2">
            Complete <span className="text-blue-600">Your Booking</span>
          </h1>
          <p className="text-slate-500 font-medium">
            Enter passenger details to complete your booking
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  Passenger Details
                </h3>

                <span className="bg-slate-900 text-white text-[10px] font-black px-3 py-1 rounded-xl uppercase tracking-widest leading-none">
                  Class: {travelClass}
                </span>
              </div>

              <div className="p-8 space-y-6">
                <AnimatePresence mode="popLayout">
                  {passengers.map((passenger, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-slate-50/50 rounded-3xl border border-slate-100 p-6 relative group hover:border-blue-400 transition-all"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-5 space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                            Full Name
                          </label>

                          <input
                            type="text"
                            className="w-full bg-white border-2 border-slate-100 rounded-2xl py-3 px-5 text-sm font-black text-slate-800 focus:border-blue-500 outline-none transition-all placeholder:text-slate-200"
                            placeholder="PASSENGER NAME"
                            value={passenger.name}
                            onChange={(e) =>
                              handlePassengerChange(index, "name", e.target.value)
                            }
                          />
                        </div>

                        <div className="md:col-span-3 space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                            Age
                          </label>

                          <input
                            type="number"
                            className="w-full bg-white border-2 border-slate-100 rounded-2xl py-3 px-5 text-sm font-black text-slate-800 focus:border-blue-500 outline-none transition-all"
                            placeholder="YRS"
                            value={passenger.age}
                            onChange={(e) =>
                              handlePassengerChange(index, "age", e.target.value)
                            }
                          />
                        </div>

                        <div className="md:col-span-4 space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                            Gender
                          </label>

                          <select
                            className="w-full bg-white border-2 border-slate-100 rounded-2xl py-3 px-5 text-sm font-black text-slate-800 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer"
                            value={passenger.gender}
                            onChange={(e) =>
                              handlePassengerChange(index, "gender", e.target.value)
                            }
                          >
                            <option>Male</option>
                            <option>Female</option>
                            <option>Other</option>
                          </select>
                        </div>
                      </div>

                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePassenger(index)}
                          className="absolute -top-3 -right-3 w-8 h-8 bg-white border border-slate-100 text-slate-300 hover:text-red-500 hover:border-red-500 rounded-full flex items-center justify-center shadow-lg transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                <button
                  type="button"
                  onClick={handleAddPassenger}
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-xl hover:bg-blue-50 transition-all"
                >
                  <Plus size={14} /> Add Passenger
                </button>
              </div>
            </section>

            <div className="bg-blue-600 rounded-[2.5rem] p-10 text-white shadow-xl shadow-blue-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-10 opacity-10">
                <Shield className="w-32 h-32" />
              </div>

              <h4 className="text-xl font-black uppercase tracking-tight mb-2 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                Secure Booking
              </h4>

              <p className="text-blue-100 text-sm font-medium leading-relaxed max-w-md">
                Your payment details are encrypted and secure.
              </p>
            </div>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-10">
            <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
              <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-6">
                Booking Summary
              </h3>

              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-50 rounded-xl text-slate-400">
                    <Train className="w-5 h-5" />
                  </div>

                  <div>
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-0.5">
                      {train?.name || "Loading..."}
                    </p>
                    <p className="text-sm font-black text-slate-800 uppercase tracking-tight">
                      Train #{train?.trainNumber || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-50 rounded-xl text-slate-400">
                    <Calendar className="w-5 h-5" />
                  </div>

                  <div>
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-0.5">
                      Journey Date
                    </p>
                    <p className="text-sm font-black text-slate-800 uppercase tracking-tight">
                      {journeyDate || "UNSCHEDULED"}
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Base Fare ({travelClass})
                    </p>
                    <p className="text-sm font-black text-slate-800 tracking-tighter">
                      ₹{baseFarePerPassenger.toLocaleString()}.00
                    </p>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Passengers
                    </p>
                    <p className="text-sm font-black text-slate-800 tracking-tighter">
                      x{passengers.length}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mb-8">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      GST (18%)
                    </p>
                    <p className="text-sm font-black text-slate-800 tracking-tighter">
                      ₹{gstAmountTotal.toLocaleString()}.00
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                    <p className="text-xs font-black text-slate-800 uppercase tracking-widest">
                      Total Fare
                    </p>
                    <p className="text-2xl font-black text-blue-600 tracking-tighter">
                      ₹{totalFare.toLocaleString()}.00
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <button
              onClick={handleBooking}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-[0.3em] text-[10px] py-6 px-4 rounded-[2rem] shadow-2xl shadow-slate-200 transition-all disabled:opacity-70 active:scale-95 group"
            >
              {isSubmitting ? (
                "PROCESSING..."
              ) : (
                <>
                  Confirm Booking
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-4 opacity-30 grayscale p-4">
              <Image
                src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg"
                width={48}
                height={16}
                className="h-4 w-auto"
                alt="Visa"
                unoptimized
              />
              <Image
                src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg"
                width={36}
                height={24}
                className="h-6 w-auto"
                alt="Mastercard"
                unoptimized
              />
              <Image
                src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg"
                width={48}
                height={16}
                className="h-4 w-auto"
                alt="PayPal"
                unoptimized
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
