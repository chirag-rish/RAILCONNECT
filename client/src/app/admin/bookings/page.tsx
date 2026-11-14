
"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API_URL } from '@/lib/constants';
import { ShieldCheck, Search, Filter, Download } from 'lucide-react';
import Link from 'next/link';
import BackButton from '@/components/BackButton';

interface Booking {
    _id: string;
    pnr: string;
    journeyDate: string;
    user?: {
        name?: string;
        email?: string;
    };
    train?: {
        name?: string;
        trainNumber?: string;
        source?: string;
        destination?: string;
    };
    travelClass: string;
    totalFare: number;
    status: string;
}

export default function AllBookingsPage() {
    const { user, token } = useAuth();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!user || user.role !== 'admin') return;

        const fetchBookings = async () => {
            try {
                const config = {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                };

                const { data } = await axios.get<Booking[]>(
                    `${API_URL}/bookings/all`,
                    config
                );

                setBookings(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchBookings();
    }, [user, token]);

    const filteredBookings = bookings.filter(b =>
        b.pnr.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.train?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!user || user.role !== 'admin') {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-100 text-center max-w-md">
                    <ShieldCheck className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-slate-800 mb-2">Access Restricted</h1>
                    <p className="text-slate-500 text-sm mb-6">
                        This terminal requires Level 1 Administrative Clearance.
                    </p>
                    <Link href="/login" className="inline-block bg-slate-900 text-white px-6 py-2 rounded-xl text-sm font-bold">
                        Return to Login
                    </Link>
                </div>
            </div>
        );
    }

    if (loading) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-blue-600"></div>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                    Retrieving Secure Ledger...
                </p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-10">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <BackButton />
                        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight mt-6">
                            Master Booking Registry
                        </h1>
                        <p className="text-slate-500 font-medium">
                            Complete audit trail of all transactions and reservations
                        </p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-center">
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Search PNR, Passenger, or Train..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                                <Filter className="w-4 h-4" /> Filter
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs font-bold text-blue-600 hover:bg-blue-100 transition-colors">
                                <Download className="w-4 h-4" /> Export CSV
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                                    <th className="p-5 pl-8">PNR / Date</th>
                                    <th className="p-5">Passenger Entity</th>
                                    <th className="p-5">Service Carrier</th>
                                    <th className="p-5">Route</th>
                                    <th className="p-5 text-center">Class</th>
                                    <th className="p-5 text-center">Fare</th>
                                    <th className="p-5 pr-8 text-right">Status</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-50">
                                {filteredBookings.map((booking) => (
                                    <tr key={booking._id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="p-5 pl-8">
                                            <p className="font-mono font-bold text-slate-800 text-sm">
                                                {booking.pnr}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                {new Date(booking.journeyDate).toLocaleDateString()}
                                            </p>
                                        </td>

                                        <td className="p-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs uppercase shadow-inner">
                                                    {booking.user?.name?.[0] || 'U'}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm leading-none uppercase">
                                                        {booking.user?.name || 'Anonymous'}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 mt-1 lowercase font-medium">
                                                        {booking.user?.email || 'N/A'}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="p-5">
                                            <p className="text-slate-700 font-bold text-sm uppercase leading-none">
                                                {booking.train?.name}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-1 font-mono">
                                                #{booking.train?.trainNumber || 'N/A'}
                                            </p>
                                        </td>

                                        <td className="p-5 text-xs font-bold text-slate-600">
                                            {booking.train?.source} <span className="text-slate-300 mx-1">→</span> {booking.train?.destination}
                                        </td>

                                        <td className="p-5 text-center">
                                            <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-black uppercase text-slate-500">
                                                {booking.travelClass}
                                            </span>
                                        </td>

                                        <td className="p-5 text-center font-extrabold text-slate-900">
                                            ₹{booking.totalFare}
                                        </td>

                                        <td className="p-5 pr-8 text-right">
                                            <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                                                booking.status === 'Confirmed'
                                                    ? 'bg-green-50 text-green-700 border border-green-100'
                                                    : booking.status === 'Cancelled'
                                                        ? 'bg-red-50 text-red-700 border border-red-100'
                                                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                                            }`}>
                                                {booking.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredBookings.length === 0 && (
                        <div className="p-12 text-center text-slate-400 text-sm font-medium">
                            No records found matching your criteria.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
