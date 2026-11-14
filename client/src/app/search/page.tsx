
"use client";

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import axios from 'axios';
import { API_URL } from '@/lib/constants';
import { Train, ArrowRight, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import SearchTrain from '@/components/SearchTrain';
import BackButton from '@/components/BackButton';
import { motion } from 'framer-motion';
import { formatSearchDate } from '@/utils/istTime';

interface TrainType {
    _id: string;
    trainNumber: string;
    name: string;
    source: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
    daysOfOperation: string[];
    classes: string[];
    baseFare: number;
    status?: string;
    delayMinutes?: number;
    currentStatus?: string;
    currentDelay?: number;
    currentStation?: string;
    nextStation?: string;
    lastLiveUpdateTimestamp?: string;
    liveFallbackSource?: string;
    freshness?: string;
    isStale?: boolean;
    positionSource?: string;
    liveStatusAvailable?: boolean;
    coachComposition?: { classType: string; [key: string]: unknown }[];
}

function SearchResultsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [trains, setTrains] = useState<TrainType[]>([]);
    const [loading, setLoading] = useState(true);

    const source = searchParams.get('source');
    const destination = searchParams.get('destination');
    const date = searchParams.get('date');

    useEffect(() => {
        const fetchTrains = async () => {
            if (!source || !destination || !date) {
                setLoading(false);
                return;
            }

            try {
                const { data } = await axios.get(`${API_URL}/trains/search`, {
                    params: { source, destination, date }
                });
                setTrains(data);
            } catch (error) {
                console.error(error);
                toast.error('Failed to fetch trains');
            } finally {
                setLoading(false);
            }
        };

        fetchTrains();
    }, [source, destination, date]);

    if (!source || !destination || !date) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-50 pt-8 pb-12 px-6">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-4xl font-extrabold text-slate-800 mb-2">Refine Your Search</h1>
                    <p className="text-slate-500 font-medium mb-10 uppercase tracking-widest text-[10px]">Search for trains</p>
                    <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50">
                        <SearchTrain />
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Searching for trains...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-50 pt-8 pb-12 px-6">
            <div className="max-w-5xl mx-auto">
                <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <BackButton />
                        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight mt-6 mb-2">Available Trains</h1>
                        <div className="flex items-center gap-3 text-slate-500 font-bold text-xs uppercase tracking-widest">
                            <span className="text-blue-600">{source}</span>
                            <ArrowRight size={14} className="opacity-50" />
                            <span className="text-blue-600">{destination}</span>
                            <span className="mx-2 opacity-20">|</span>
                            <span>{formatSearchDate(date || '')}</span>
                        </div>
                    </div>
                    <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Trains found</p>
                        <p className="font-bold text-slate-800">{trains.length} Services Available</p>
                    </div>
                </div>

                {trains.length === 0 ? (
                    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 p-20 text-center">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                            <Train className="h-10 w-10 text-slate-300" />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 mb-2">No trains found</h3>
                        <p className="text-slate-400 font-medium max-w-xs mx-auto mb-8">No trains match your search. Try different stations or dates.</p>
                        <button
                            onClick={() => router.push('/search')}
                            className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-800 transition-all shadow-lg"
                        >
                            New Search
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {trains.map((train, idx) => (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                key={train._id}
                                className="bg-white rounded-[2rem] shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-100 transition-all duration-300 overflow-hidden"
                            >
                                <div className="p-8">
                                    <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100 shadow-inner">
                                                <Train className="w-8 h-8" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-3">
                                                    <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-none uppercase">{train.name}</h3>
                                                    <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded tracking-tighter shadow-sm">#{train.trainNumber}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                    {train.liveStatusAvailable ? (
                                                        <>
                                                            <span
                                                                className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase border tracking-tighter ${train.status === 'Delayed' || (train.delayMinutes || 0) > 0
                                                                    ? 'bg-red-50 text-red-600 border-red-100'
                                                                    : 'bg-green-50 text-green-600 border-green-100'
                                                                    }`}
                                                            >
                                                                {train.status === 'Delayed' || (train.delayMinutes || 0) > 0 ? `DELAYED +${Math.round(train.delayMinutes || 0)} min` : (train.status || 'On Time')}
                                                            </span>
                                                            <span className="text-[9px] px-2 py-0.5 rounded-full font-black uppercase bg-blue-50 text-blue-600 border border-blue-100 tracking-tighter">
                                                                {train.liveFallbackSource === 'SIMULATOR_FALLBACK' ? 'Simulator Fallback' : 'RailRadar Live'}
                                                            </span>
                                                            {train.currentStation && (
                                                                <span className="text-[9px] text-slate-500 font-bold uppercase">
                                                                    At: {train.currentStation} {train.nextStation ? `→ Next: ${train.nextStation}` : ''}
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <span className="text-[9px] px-2 py-0.5 rounded-full font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 tracking-tighter">
                                                            Live Status Unavailable
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                                        Registry Validated
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right hidden md:block">
                                            <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Service Cadence</div>
                                            <div className="flex gap-1 justify-end">
                                                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                                                    <span key={i} className={`w-5 h-5 flex items-center justify-center rounded text-[9px] font-black ${train.daysOfOperation.length > i ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-50 text-slate-300'}`}>
                                                        {d}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mb-10 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                                        <div className="text-left w-24">
                                            <p className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-1">{train.departureTime}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{train.source}</p>
                                        </div>
                                        <div className="flex-1 px-8 flex flex-col items-center">
                                            <div className="w-full h-1 bg-slate-200 rounded-full relative">
                                                <div className="absolute right-0 -top-1.5 h-4 w-4 rounded-full bg-white border-4 border-slate-200 shadow-sm"></div>
                                                <div className="absolute left-0 -top-1.5 h-4 w-4 rounded-full bg-white border-4 border-blue-600 shadow-sm"></div>
                                                <div className="absolute left-0 h-full bg-blue-600 rounded-full" style={{ width: '100%' }}></div>
                                            </div>
                                            <div className="flex items-center gap-2 mt-3">
                                                <Clock className="w-3 h-3 text-slate-300" />
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Journey time</p>
                                            </div>
                                        </div>
                                        <div className="text-right w-24">
                                            <p className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-1">{train.arrivalTime}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{train.destination}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {(() => {
                                            let classList: string[] = [];

                                            if (Array.isArray(train.classes) && train.classes.length > 0) {
                                                classList = train.classes;
                                            } else if (Array.isArray(train.coachComposition) && train.coachComposition.length > 0) {
                                                classList = train.coachComposition.map(c => c.classType);
                                            }

                                            classList = [...new Set(classList)].filter(Boolean);

                                            return classList.map((cls) => {
                                                const isWL = cls === 'SL' && Math.random() > 0.5;
                                                const wlCount = isWL ? Math.floor(Math.random() * 50) + 1 : 0;

                                                return (
                                                    <button
                                                        key={cls}
                                                        onClick={() => {
                                                            router.push(`/book/${train._id}?class=${cls}&date=${date}`);
                                                        }}
                                                        className={`p-4 rounded-2xl border-2 transition-all text-left relative overflow-hidden active:scale-95 group ${isWL ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-50'}`}
                                                    >
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-lg font-black text-slate-800 group-hover:text-blue-600 transition-colors uppercase">{cls}</span>
                                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded tracking-widest ${isWL ? 'text-amber-700 bg-white border border-amber-200' : 'text-green-600 bg-green-50'}`}>
                                                                {isWL ? `Waitlist ${wlCount}` : 'Available'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-baseline gap-1 mt-3">
                                                            <p className="text-lg font-mono font-black text-slate-900 leading-none">₹{Math.round(train.baseFare * (cls === '1A' ? 2 : cls === '2A' ? 1.5 : 1))}</p>
                                                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Gross Fare</p>
                                                        </div>
                                                        {isWL && (
                                                            <div className="mt-3 flex items-center gap-1.5">
                                                                <div className="flex gap-1">
                                                                    <div className={`h-1 w-2 rounded-full ${wlCount < 20 ? 'bg-green-500' : 'bg-amber-400'}`}></div>
                                                                    <div className={`h-1 w-2 rounded-full ${wlCount < 20 ? 'bg-green-500 opacity-20' : 'bg-amber-100 underline'}`}></div>
                                                                </div>
                                                                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                                    {wlCount < 20 ? 'Good chance' : 'Low probability'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SearchResultsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
        }>
            <SearchResultsContent />
        </Suspense>
    );
}
