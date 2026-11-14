
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";

interface Booking {
  _id: string;
  trainName: string;
  pnr: string;
  date: string;
  status: string;
  ticketUrl?: string;
}

export default function BookingHistoryPage() {
  const { token } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchBookings = async () => {
      try {
        const res = await axios.get<Booking[]>("/api/bookings/mybookings", {
          headers: { Authorization: `Bearer ${token}` },
        });

        setBookings(res.data || []);
      } catch {
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, [token, router]);

  const handleDownloadFallback = (booking: Booking) => {
    const content = `Ticket for ${booking.trainName}\nPNR: ${booking.pnr}\nDate: ${new Date(booking.date).toLocaleDateString()}\nStatus: ${booking.status}`;

    const blob = new Blob([content], { type: "application/pdf" });
    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = `ticket_${booking.pnr}.pdf`;
    link.click();

    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-6">Booking History</h1>

      {loading ? (
        <div className="text-blue-400">Loading...</div>
      ) : bookings.length === 0 ? (
        <div className="text-slate-400">No bookings found.</div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => (
            <div
              key={b._id}
              className="bg-white rounded-xl shadow p-4 flex items-center justify-between"
            >
              <div>
                <div className="font-bold text-blue-900">{b.trainName}</div>
                <div className="text-xs text-slate-400">PNR: {b.pnr}</div>
                <div className="text-xs text-slate-400">
                  Date: {new Date(b.date).toLocaleDateString()}
                </div>
                <div className="text-xs text-slate-400">Status: {b.status}</div>
              </div>

              {b.ticketUrl ? (
                <a
                  href={b.ticketUrl}
                  download
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition"
                >
                  <Download className="w-4 h-4" /> Download
                </a>
              ) : (
                <button
                  onClick={() => handleDownloadFallback(b)}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition"
                >
                  <Download className="w-4 h-4" /> Download
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
