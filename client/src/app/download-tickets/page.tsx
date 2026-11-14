
"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import { API_URL } from "@/lib/constants";
import { FileText, Download, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import BackButton from "@/components/BackButton";

interface Booking {
  _id: string;
  pnr: string;
  train: { name: string; trainNumber: string };
  journeyDate: string;
  ticketUrl?: string;
}

export default function DownloadTicketsPage() {
  const { user, token, isLoading: isAuthLoading } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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

        const { data } = await axios.get<Booking[]>(
          `${API_URL}/bookings/mybookings`,
          config
        );

        setBookings(data);
      } catch {
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };

    if (user) fetchBookings();
  }, [user, token, isAuthLoading]);

  const handleDownload = useCallback(async (booking: Booking) => {
    if (!booking.ticketUrl) return;

    setDownloadingId(booking._id);
    setDownloadError(null);

    try {
      const baseUrl =
        typeof window !== "undefined" ? window.location.origin : "";

      const fullUrl = booking.ticketUrl.startsWith("http")
        ? booking.ticketUrl
        : `${baseUrl}${booking.ticketUrl}`;

      const response = await fetch(fullUrl);

      if (!response.ok) {
        throw new Error(`Ticket file not found (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = blobUrl;
      link.download = `ticket_${booking.pnr}.pdf`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(blobUrl);
    } catch (error: unknown) {
      console.error("Download failed:", error);

      const message =
        error instanceof Error ? error.message : "Unknown error";

      setDownloadError(
        `Failed to download ticket for PNR ${booking.pnr}: ${message}`
      );
    } finally {
      setDownloadingId(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">
          Loading tickets...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 flex flex-col items-center justify-center gap-6">
        <FileText className="w-16 h-16 text-blue-200" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
          Please log in to view your tickets
        </p>
        <Link
          href="/login"
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <BackButton />
          <h1 className="text-3xl font-black text-blue-900 flex items-center gap-2">
            <FileText className="w-7 h-7 text-blue-400" /> Download Tickets
          </h1>
        </div>

        {downloadError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-700">Download Error</p>
              <p className="text-xs text-red-600 mt-1">{downloadError}</p>
            </div>
            <button
              onClick={() => setDownloadError(null)}
              className="ml-auto text-red-400 hover:text-red-600 text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {bookings.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center shadow">
            <FileText className="w-12 h-12 text-blue-200 mx-auto mb-4" />
            <p className="text-blue-400 font-bold">No bookings found.</p>
            <Link
              href="/search"
              className="mt-4 inline-block text-blue-600 underline font-bold text-sm"
            >
              Search Trains
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {bookings.map((booking) => (
              <div
                key={booking._id}
                className="bg-white rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between shadow border border-blue-100"
              >
                <div>
                  <div className="font-black text-blue-900 text-lg">
                    {booking.train?.name || "Unknown Train"}
                  </div>
                  <div className="text-xs text-blue-400 font-mono">
                    PNR: {booking.pnr}
                  </div>
                  <div className="text-xs text-slate-400">
                    Date: {new Date(booking.journeyDate).toLocaleDateString()}
                  </div>
                </div>

                {booking.ticketUrl ? (
                  <button
                    onClick={() => handleDownload(booking)}
                    disabled={downloadingId === booking._id}
                    className="mt-4 md:mt-0 inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl font-bold uppercase text-xs hover:bg-blue-700 transition-all shadow active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloadingId === booking._id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download PDF
                      </>
                    )}
                  </button>
                ) : (
                  <span className="mt-4 md:mt-0 text-xs text-slate-400">
                    No ticket available
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <Link
            href="/my-bookings"
            className="text-blue-600 underline font-bold"
          >
            Go to Booking History
          </Link>
        </div>
      </div>
    </div>
  );
}
