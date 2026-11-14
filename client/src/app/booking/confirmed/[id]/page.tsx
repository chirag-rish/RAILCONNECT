
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/lib/constants';
import {
    CheckCircle,
    Train,
    Printer,
    Home,
    ShieldCheck,
    XCircle,
    ChevronRight,
    QrCode,
    Calendar,
    Clock,
    FileText,
    AlertTriangle
} from 'lucide-react';
import RazorpayCheckout from '@/components/RazorpayCheckout';
import WeatherIndicator from '@/components/WeatherIndicator';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

interface Passenger {
    name: string;
    age: number;
    gender: string;
    assigned_seat?: string;
    status: string;
}

interface Booking {
    _id: string;
    pnr: string;
    status: string;
    journeyDate: string;
    ticketUrl?: string;
    train: {
        name: string;
        trainNumber: string;
        destination: string;
    };
    passengers: Passenger[];
    travelClass?: string;
    fareBreakdown?: {
        baseFare?: number;
        gst?: number;
    };
    totalFare: number;
    paymentStatus?: string;
}

export default function BookingConfirmed() {
    const { id } = useParams<{ id: string }>();
    const { user, isLoading: isAuthLoading } = useAuth();
    const router = useRouter();

    const [booking, setBooking] = useState<Booking | null>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [paying, setPaying] = useState(false);

    const handleCancel = async () => {
        if (!confirm('Are you sure you want to cancel this booking? Cancellation fees may apply.')) return;

        setCancelling(true);

        try {
            const config = {
                headers: {
                    Authorization: `Bearer ${user?.token}`
                }
            };

            await axios.put(`${API_URL}/bookings/${id}/cancel`, {}, config);

            const { data } = await axios.get<Booking>(
                `${API_URL}/bookings/${id}`,
                config
            );

            setBooking(data);
        } catch (error: unknown) {
            const message = axios.isAxiosError<{ message?: string }>(error)
                ? error.response?.data?.message
                : undefined;

            alert(message || 'Something went wrong. Please try again.');
        } finally {
            setCancelling(false);
        }
    };

    const handlePaymentSuccess = async () => {
        setPaying(false);

        try {
            const config = {
                headers: {
                    Authorization: `Bearer ${user?.token}`
                }
            };

            const { data } = await axios.get<Booking>(
                `${API_URL}/bookings/${id}`,
                config
            );

            setBooking(data);
        } catch (error) {
            console.error('Failed to refresh booking after payment', error);
        }
    };

    const handlePaymentFailure = () => {
        setPaying(false);
    };

    useEffect(() => {
        if (!isAuthLoading && !user) return;

        const fetchBooking = async () => {
            try {
                const config = {
                    headers: {
                        Authorization: `Bearer ${user?.token}`
                    }
                };

                const { data } = await axios.get<Booking>(
                    `${API_URL}/bookings/${id}`,
                    config
                );

                setBooking(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        if (user) fetchBooking();
    }, [id, user, isAuthLoading]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6">
                <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading your booking...</p>
            </div>
        );
    }

    if (!booking) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6">
                <XCircle className="w-16 h-16 text-red-100" />
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Booking not found</p>
                <button onClick={() => router.push('/')} className="text-blue-600 font-bold text-xs uppercase underline">Return Home</button>
            </div>
        );
    }

    const isCancelled = booking.status === 'Cancelled';

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-10 flex flex-col items-center">
            <div className="max-w-3xl w-full">
                <div className="mb-12 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all",
                            isCancelled ? "bg-red-50 text-red-500 shadow-red-100" : "bg-blue-600 text-white shadow-blue-100"
                        )}>
                            {isCancelled ? <XCircle className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none uppercase">
                                {isCancelled ? "Booking Cancelled" : "Booking Confirmed"}
                            </h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                Status: {isCancelled ? "CANCELLED" : "CONFIRMED"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm">
                        <QrCode className="w-4 h-4 text-slate-300" />
                        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-tighter">Booking: {String(id).slice(-8)}</span>
                    </div>
                </div>

                {booking.ticketUrl && (
                    <div className="mb-8 flex justify-end">
                        <button
                            onClick={async () => {
                                try {
                                    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                                    const fullUrl = booking.ticketUrl!.startsWith('http')
                                        ? booking.ticketUrl!
                                        : `${baseUrl}${booking.ticketUrl}`;

                                    const response = await fetch(fullUrl);

                                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                                    const blob = await response.blob();
                                    const blobUrl = window.URL.createObjectURL(blob);
                                    const link = document.createElement('a');

                                    link.href = blobUrl;
                                    link.download = `ticket_${booking.pnr}.pdf`;

                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);

                                    window.URL.revokeObjectURL(blobUrl);
                                } catch {
                                    alert('Failed to download ticket. Please try again.');
                                }
                            }}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95"
                        >
                            <Printer className="w-4 h-4" /> Download Ticket
                        </button>
                    </div>
                )}

                <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="bg-white rounded-[3rem] shadow-2xl shadow-slate-200/50 border border-slate-200 overflow-hidden relative"
                >
                    <div className="absolute top-0 right-0 p-20 opacity-[0.02] select-none pointer-events-none">
                        <Train className="w-96 h-96" />
                    </div>

                    <div className={cn(
                        "p-10 border-b-2 border-dashed border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative",
                        isCancelled ? "bg-red-50/30" : "bg-blue-50/10"
                    )}>
                        <div>
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-2">Booking Reference (PNR)</p>
                            <h2 className="text-5xl font-mono font-black text-slate-900 tracking-tighter leading-none">{booking.pnr}</h2>
                            <div className="mt-4 flex flex-wrap gap-4">
                                <div className="flex items-center gap-2 text-slate-500">
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span className="text-xs font-black uppercase tracking-tighter">{new Date(booking.journeyDate).toDateString()}</span>
                                </div>
                                <div className="w-[1px] h-4 bg-slate-200" />
                                <div className="flex items-center gap-2 text-slate-500">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span className="text-xs font-black uppercase tracking-tighter">Journey date</span>
                                </div>
                            </div>
                        </div>

                        <div className="text-right">
                            <div className={cn(
                                "inline-flex items-center gap-2 px-4 py-2 rounded-2xl border-2 font-black uppercase tracking-[0.1em] text-xs shadow-lg",
                                isCancelled
                                    ? "bg-red-600 text-white border-red-600 shadow-red-100"
                                    : "bg-green-600 text-white border-green-600 shadow-green-100"
                            )}>
                                {isCancelled ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                                {booking.status === 'CNF' ? 'CONFIRMED' : booking.status}
                            </div>
                        </div>

                        <div className="absolute -bottom-4 -left-4 w-8 h-8 bg-slate-50 rounded-full border border-slate-100 shadow-inner" />
                        <div className="absolute -bottom-4 -right-4 w-8 h-8 bg-slate-50 rounded-full border border-slate-100 shadow-inner" />
                    </div>

                    <div className="p-10 space-y-12">
                        <div className="flex items-center gap-6 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-blue-600 border border-slate-200 shadow-sm">
                                <Train className="w-8 h-8" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none mb-1">{booking.train.name}</h3>
                                <div className="flex items-center gap-4">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Train #{booking.train.trainNumber}</span>
                                    <div className="w-1 h-1 bg-slate-300 rounded-full" />
                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Indian Railways</span>
                                </div>
                            </div>
                            <div className="hidden md:flex items-center gap-3">
                                <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-right">
                                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Class</p>
                                    <p className="text-xs font-black text-slate-700 uppercase">{booking.travelClass || 'SL'}</p>
                                </div>
                                <WeatherIndicator
                                    destinationCode={booking.train.destination}
                                    destinationName={booking.train.destination}
                                    compact
                                />
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] mb-6 flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5" /> Passenger Details
                            </h4>
                            <div className="border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 text-slate-400">
                                        <tr>
                                            <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Passenger</th>
                                            <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em]">Seat</th>
                                            <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {booking.passengers.map((p, idx) => (
                                            <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                                                <td className="px-8 py-6">
                                                    <div className="font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-600 transition-colors">{p.name}</div>
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">{p.age} YRS • {p.gender}</div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="text-xs font-mono font-black text-slate-700 uppercase tracking-tighter bg-slate-50 px-3 py-1.1 rounded-lg border border-slate-100 inline-block">{p.assigned_seat || 'Seat being assigned'}</div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <span className={cn(
                                                        "text-[10px] font-black uppercase tracking-widest",
                                                        p.status === 'Confirmed' || p.status === 'CNF' ? 'text-green-600' : 'text-slate-400'
                                                    )}>{p.status === 'CNF' ? 'CONFIRMED' : p.status}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-xl shadow-slate-200">
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Fare Breakdown</p>
                                <div className="space-y-2 mb-4">
                                    <div className="flex justify-between gap-6">
                                        <span className="text-sm font-medium text-slate-400">Base Fare</span>
                                        <span className="text-sm font-bold text-slate-200">₹{booking.fareBreakdown?.baseFare?.toLocaleString() || Math.round(booking.totalFare / 1.18).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between gap-6 text-amber-300">
                                        <span className="text-sm font-medium">GST (18%)</span>
                                        <span className="text-sm font-bold">₹{booking.fareBreakdown?.gst?.toLocaleString() || Math.round(booking.totalFare - Math.round(booking.totalFare / 1.18)).toLocaleString()}</span>
                                    </div>
                                    <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between gap-6">
                                        <span className="text-base font-black text-white">Total Fare</span>
                                        <span className="text-2xl font-black text-white">₹{booking.totalFare?.toLocaleString()}</span>
                                    </div>
                                </div>
                                {isCancelled && (
                                    <div className="mt-3 flex items-center gap-2">
                                        <div className="w-2 h-2 bg-red-500 rounded-full" />
                                        <span className="text-xs font-black text-red-100 uppercase tracking-tighter">Refund processing: ₹{(booking.totalFare * 0.8).toLocaleString()}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-4 w-full md:w-auto">
                                <button
                                    onClick={() => window.print()}
                                    className="flex-1 flex items-center justify-center gap-3 bg-white/10 hover:bg-white/20 text-white py-4 px-8 rounded-2xl border border-white/10 transition-all font-black uppercase tracking-widest text-[10px] backdrop-blur-md"
                                >
                                    <Printer className="w-4 h-4" /> Print Ticket
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <div className="mt-12 flex flex-col md:flex-row gap-4">
                    {!isCancelled && (
                        <div className="flex-1">
                            {booking.paymentStatus === 'Completed' ? (
                                <button
                                    disabled
                                    className="w-full flex items-center justify-center gap-3 bg-green-600 text-white py-5 rounded-[2rem] font-black uppercase tracking-widest text-[10px]"
                                >
                                    <ShieldCheck className="w-4 h-4" /> Payment Completed
                                </button>
                            ) : (
                                <RazorpayCheckout
                                    amount={booking.totalFare}
                                    bookingId={booking._id}
                                    onStart={() => setPaying(true)}
                                    onSuccess={handlePaymentSuccess}
                                    onFailure={handlePaymentFailure}
                                    label={paying ? 'Processing…' : 'Pay with Razorpay'}
                                />
                            )}
                        </div>
                    )}

                    <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="flex-1 flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-500 py-5 rounded-[2rem] transition-all font-black uppercase tracking-widest text-[10px] shadow-sm disabled:opacity-50 active:scale-95 group"
                    >
                        {cancelling ? 'CANCELLING...' : (
                            <>
                                Cancel Booking <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => router.push('/')}
                        className="flex-1 flex items-center justify-center gap-3 bg-slate-100 hover:bg-slate-200 text-slate-600 py-5 rounded-[2rem] transition-all font-black uppercase tracking-widest text-[10px] active:scale-95"
                    >
                        <Home className="w-4 h-4" /> Back to Home
                    </button>
                </div>

                <div className="mt-20 text-center">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em]">BOOKING CONFIRMED • INDIAN RAILWAYS</p>
                </div>
            </div>
        </div>
    );
}
