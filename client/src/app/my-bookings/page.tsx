
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/constants";
import {
    Train,
    Calendar,
    ChevronRight,
    ArrowRight,
    FileText,
    History
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import BackButton from "@/components/BackButton";
import WeatherIndicator from "@/components/WeatherIndicator";

interface Booking {
    _id: string;
    pnr: string;
    train: {
        trainNumber: string;
        name: string;
        departureTime: string;
        arrivalTime: string;
    };
    journeyDate: string;
    status: string;
    totalFare: number;
    passengers: unknown[];
}

export default function MyBookings() {
    const { user, token, isLoading: isAuthLoading } = useAuth();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isAuthLoading && !user) {
            setLoading(false);
            return;
        }

        const fetchBookings = async () => {
            const storedUser =
                typeof window !== "undefined"
                    ? JSON.parse(localStorage.getItem("user") || "{}")
                    : null;

            const authToken = token || storedUser?.token;

            if (!authToken) {
                setLoading(false);
                return;
            }

            try {
                const config = {
                    headers: {
                        Authorization: `Bearer ${authToken}`
                    }
                };

                const { data } = await axios.get(
                    `${API_URL}/bookings/mybookings`,
                    config
                );

                setBookings(data);
            } catch (error) {
                console.error(error);
                setBookings([]);
            } finally {
                setLoading(false);
            }
        };

        if (user) fetchBookings();
    }, [user, token, isAuthLoading]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 flex flex-col items-center justify-center gap-6">
                <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">
                    Loading your bookings...
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 text-slate-900 font-sans p-6 md:p-10">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8 flex items-center justify-between">
                    <BackButton />

                    <div className="flex items-center gap-2">
                        <WeatherIndicator compact />

                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-50 to-slate-100 border border-blue-100 shadow-sm">
                            <History className="w-4 h-4 text-blue-600" />
                            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
                                My Bookings
                            </span>
                        </div>
                    </div>
                </div>

                <header className="mb-12">
                    <h1 className="text-4xl font-extrabold tracking-tight text-blue-900 mb-2 drop-shadow-sm">
                        My <span className="text-blue-600">Bookings</span>
                    </h1>

                    <p className="text-blue-500 font-medium bg-blue-50/60 rounded-xl px-4 py-2 inline-block shadow-sm">
                        All your confirmed and past train bookings
                    </p>
                </header>

                {bookings.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gradient-to-br from-blue-50 via-white to-slate-100 rounded-[2.5rem] border border-blue-100 p-20 text-center shadow-xl shadow-blue-100/50"
                    >
                        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-100">
                            <FileText className="w-10 h-10 text-blue-200" />
                        </div>

                        <h3 className="text-xl font-black text-blue-900 uppercase tracking-tight mb-2">
                            No bookings yet
                        </h3>

                        <p className="text-blue-400 font-medium max-w-xs mx-auto text-sm leading-relaxed mb-8">
                            You haven&apos;t booked any trains yet. Search for trains to get started.
                        </p>

                        <Link
                            href="/search"
                            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95"
                        >
                            Search Trains
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </motion.div>
                ) : (
                    <div className="space-y-6">
                        {bookings.map((booking, index) => (
                            <motion.div
                                key={booking._id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="bg-gradient-to-br from-blue-50 via-white to-slate-100 rounded-[2.5rem] border border-blue-100 shadow-sm hover:shadow-2xl hover:shadow-blue-100/50 transition-all group overflow-hidden"
                            >
                                <div className="p-8">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                                        <div className="flex items-center gap-6">
                                            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-400 border border-blue-100 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors shadow-inner">
                                                <Train className="w-7 h-7" />
                                            </div>

                                            <div>
                                                <h3 className="text-xl font-black text-blue-900 uppercase tracking-tight group-hover:text-blue-600 transition-colors leading-none mb-1.5">
                                                    {booking.train?.name || "Unknown train"}
                                                </h3>

                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-mono font-black text-blue-400 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 tracking-tighter shadow-sm">
                                                        #{booking.train?.trainNumber}
                                                    </span>

                                                    <div className="w-1 h-1 bg-blue-100 rounded-full" />

                                                    <div className="flex items-center gap-1 text-[10px] font-black text-blue-400 uppercase tracking-widest">
                                                        <Calendar size={12} className="text-blue-200" />
                                                        {new Date(booking.journeyDate).toDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:flex-1 md:justify-end items-center">
                                            <div className="text-left md:text-center">
                                                <p className="text-[9px] font-black text-blue-300 uppercase tracking-widest mb-1">
                                                    Booking Reference (PNR)
                                                </p>

                                                <p className="font-mono font-black text-blue-900 tracking-tighter text-sm uppercase">
                                                    {booking.pnr}
                                                </p>
                                            </div>

                                            <div className="text-left md:text-center">
                                                <p className="text-[9px] font-black text-blue-300 uppercase tracking-widest mb-1">
                                                    Status
                                                </p>

                                                <span
                                                    className={cn(
                                                        "inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] border shadow-sm",
                                                        (booking.status === "Confirmed" || booking.status === "Completed")
                                                            ? "bg-green-100 text-green-700 border-green-200"
                                                            : "bg-red-100 text-red-700 border-red-200"
                                                    )}
                                                >
                                                    {booking.status}
                                                </span>
                                            </div>

                                            <div className="hidden md:flex justify-end">
                                                <Link
                                                    href={`/booking/confirmed/${booking._id}`}
                                                    className="bg-blue-50 text-blue-300 p-4 rounded-2xl hover:bg-blue-600 hover:text-white hover:shadow-xl hover:shadow-blue-200 transition-all active:scale-95 group/link"
                                                >
                                                    <ChevronRight
                                                        size={20}
                                                        className="group-hover/link:translate-x-1 transition-transform"
                                                    />
                                                </Link>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-6 border-t border-blue-50 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full" />

                                            <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest">
                                                {booking.passengers.length} Passenger
                                                {booking.passengers.length !== 1 ? "s" : ""}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest">
                                                Total Fare
                                            </p>

                                            <p className="text-lg font-black text-blue-900 tracking-tighter leading-none">
                                                ₹{booking.totalFare.toLocaleString()}.00
                                            </p>
                                        </div>
                                    </div>

                                    <Link
                                        href={`/booking/confirmed/${booking._id}`}
                                        className="md:hidden mt-6 flex items-center justify-center gap-2 w-full py-4 bg-blue-50 text-blue-400 font-black uppercase tracking-widest text-[9px] rounded-xl hover:bg-blue-100 hover:text-blue-600 transition-all border border-blue-100"
                                    >
                                        View Ticket
                                        <ChevronRight size={14} />
                                    </Link>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                <div className="mt-20 text-center">
                    <p className="text-[10px] font-black text-blue-300 uppercase tracking-[0.5em]">
                        YOUR BOOKINGS • {bookings.length} BOOKING
                        {bookings.length !== 1 ? "S" : ""}
                    </p>
                </div>
            </div>
        </div>
    );
}
