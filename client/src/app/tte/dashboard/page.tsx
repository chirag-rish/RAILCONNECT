
"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import { API_URL } from "@/lib/constants";
import { QrCode, Search, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

interface Passenger {
    name: string;
    assignedSeat?: string;
}

interface BookingDetails {
    status: string;
    train: {
        name: string;
        trainNumber: string;
    };
    travelClass: string;
    passengers: Passenger[];
}

interface ScanResult {
    valid: boolean;
    message: string;
    details?: BookingDetails;
}

export default function TTEDashboard() {
    const { user } = useAuth();
    const [pnr, setPnr] = useState("");
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [loading, setLoading] = useState(false);

    const handleVerify = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!pnr) return;

        setLoading(true);
        setScanResult(null);

        try {
            const config = {
                headers: {
                    Authorization: `Bearer ${user?.token}`
                }
            };

            const { data } = await axios.get<BookingDetails>(
                `${API_URL}/tte/verify/${pnr}`,
                config
            );

            if (data) {
                setScanResult({
                    valid: data.status === "Booked",
                    message: `Booking Found: ${data.train.name} (${data.train.trainNumber}). Class: ${data.travelClass}. Passengers: ${data.passengers.length}`,
                    details: data
                });

                toast.success("Ticket Verified");
            }
        } catch (error: unknown) {
            const message = axios.isAxiosError<{ message?: string }>(error)
                ? error.response?.data?.message || "PNR Not Found / Invalid"
                : "An unexpected error occurred";

            setScanResult({
                valid: false,
                message
            });

            toast.error("Verification Failed");
        } finally {
            setLoading(false);
        }
    };

    if (user?.role !== "tte" && user?.role !== "admin") {
        return (
            <div className="p-10 text-center text-red-500">
                Access Denied. Staff Only.
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden">
                <div className="bg-indigo-600 p-6 text-white text-center">
                    <h1 className="text-2xl font-bold">TTE Terminal</h1>
                    <p className="opacity-80">Ticket Verification System</p>
                </div>

                <div className="p-6 space-y-6">
                    <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-100 transition">
                        <QrCode className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-500">Tap to Scan QR Code</p>
                        <p className="text-xs text-indigo-500 mt-2 font-semibold">
                            (Camera Simulation)
                        </p>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">
                                Or enter Manually
                            </span>
                        </div>
                    </div>

                    <form onSubmit={handleVerify} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                PNR Number
                            </label>
                            <input
                                type="text"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-3"
                                placeholder="Enter 10-digit PNR"
                                value={pnr}
                                onChange={(e) => setPnr(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white p-3 rounded-md font-bold hover:bg-indigo-700 transition shadow-lg disabled:opacity-70"
                        >
                            {loading ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                <>
                                    <Search size={18} /> VerifyTicket
                                </>
                            )}
                        </button>
                    </form>

                    {scanResult && (
                        <div
                            className={`p-4 rounded-md ${
                                scanResult.valid ? "bg-green-50" : "bg-red-50"
                            } animate-in fade-in zoom-in duration-300`}
                        >
                            <div className="flex items-start gap-3">
                                {scanResult.valid ? (
                                    <CheckCircle className="text-green-600 shrink-0" />
                                ) : (
                                    <XCircle className="text-red-600 shrink-0" />
                                )}

                                <div>
                                    <h3
                                        className={`font-bold ${
                                            scanResult.valid
                                                ? "text-green-800"
                                                : "text-red-800"
                                        }`}
                                    >
                                        {scanResult.valid
                                            ? "Ticket Verified"
                                            : "Invalid Ticket"}
                                    </h3>

                                    <p className="text-sm text-gray-600 mt-1">
                                        {scanResult.message}
                                    </p>

                                    {scanResult.valid && scanResult.details && (
                                        <div className="mt-2 text-sm text-gray-700">
                                            <p className="font-semibold">
                                                Passengers:
                                            </p>

                                            <ul className="list-disc list-inside">
                                                {scanResult.details.passengers.map(
                                                    (passenger, index) => (
                                                        <li key={`${passenger.name}-${index}`}>
                                                            {passenger.name} (
                                                            {passenger.assignedSeat || "Not Assigned"}
                                                            )
                                                        </li>
                                                    )
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
