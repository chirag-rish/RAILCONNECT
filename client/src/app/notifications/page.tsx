
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import { API_URL } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Mail,
  CheckCircle,
  AlertCircle,
  Clock,
  Check,
  ShieldCheck,
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { cn } from "@/utils/cn";
import BackButton from "@/components/BackButton";

interface Notification {
  _id: string;
  type: "booking" | "train" | "system" | "refund";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  data?: {
    bookingId?: string;
    pnr?: string;
    trainNumber?: string;
  };
}

const NotificationCenter = () => {
  const { token } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "unread">("all");

  const filters = [
    { value: "all", label: "Registry Hub" },
    { value: "unread", label: "Priority Items" },
  ] as const;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);

    try {
      const response = await axios.get(
        `${API_URL}/users/notifications`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit: 50 },
        }
      );

      setNotifications(response.data.notifications || []);
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : undefined;

      toast.error(message || "Failed to fetch notifications");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(fetchNotifications, 10000);

    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (notificationId: string) => {
    try {
      await axios.post(
        `${API_URL}/users/notifications/${notificationId}/read`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setNotifications((prev) =>
        prev.map((n) =>
          n._id === notificationId ? { ...n, read: true } : n
        )
      );
    } catch {
      toast.error("Failed to sync status");
    }
  };

  const deleteNotification = (notificationId: string) => {
    setNotifications((prev) =>
      prev.filter((n) => n._id !== notificationId)
    );

    toast.success("Entry purged from local view");
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications
        .filter((n) => !n.read)
        .map((n) => n._id);

      await Promise.all(
        unreadIds.map((id) => markAsRead(id))
      );

      toast.success("Registry status synchronized");
    } catch {
      toast.error("Batch operation failed");
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "booking":
        return <CheckCircle className="w-5 h-5 text-green-600" />;

      case "train":
        return <AlertCircle className="w-5 h-5 text-amber-600" />;

      case "refund":
        return <Mail className="w-5 h-5 text-blue-600" />;

      case "system":
        return <ShieldCheck className="w-5 h-5 text-slate-400" />;

      default:
        return <Bell className="w-5 h-5 text-slate-400" />;
    }
  };

  const filteredNotifications =
    activeFilter === "unread"
      ? notifications.filter((n) => !n.read)
      : notifications;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <BackButton />

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
              Authenticated Dispatch
            </span>
          </div>
        </div>

        <header className="mb-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 mb-2">
                System <span className="text-blue-600">Dispatch</span>
              </h1>

              <p className="text-slate-500 font-medium">
                Monitoring and auditing real-time transit communications
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-2 px-6 py-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all font-black uppercase tracking-widest text-[10px] shadow-xl shadow-slate-200"
              >
                <Check className="w-4 h-4" />
                Synchronize Read Status
              </button>
            )}
          </div>
        </header>

        <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between mb-8">
          <div className="inline-flex p-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm">
            {filters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setActiveFilter(filter.value)}
                className={cn(
                  "px-8 py-2.5 font-black text-xs uppercase tracking-widest rounded-xl transition-all duration-300",
                  activeFilter === filter.value
                    ? "bg-slate-900 text-white shadow-lg"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm text-right">
              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-0.5">
                Queue Status
              </p>

              <p className="text-xs font-black text-slate-700">
                {unreadCount} UNREAD ENTRIES
              </p>
            </div>

            <button
              onClick={fetchNotifications}
              disabled={loading}
              className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-blue-600 transition-all"
            >
              <RefreshCw
                className={cn("w-4 h-4", loading && "animate-spin")}
              />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {loading && notifications.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center gap-6 bg-white rounded-[2rem] border border-slate-200">
              <div className="w-16 h-16 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin" />

              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                Querying Dispatch Log...
              </p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-[2rem] border border-slate-200 p-20 text-center shadow-sm"
            >
              <Bell className="w-20 h-20 text-slate-100 mx-auto mb-6" />

              <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">
                Log Clear
              </h3>

              <p className="text-slate-400 font-medium max-w-xs mx-auto text-sm leading-relaxed">
                No communications matching current filter in the hub registry.
              </p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {filteredNotifications.map((notification, index) => (
                  <motion.div
                    key={notification._id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "group bg-white rounded-[2rem] border transition-all p-8 relative overflow-hidden",
                      !notification.read
                        ? "border-blue-100 shadow-xl shadow-blue-50/50"
                        : "border-slate-100 shadow-sm opacity-70 grayscale-[0.5]"
                    )}
                  >
                    {!notification.read && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />
                    )}

                    <div className="flex flex-col md:flex-row items-start gap-6">
                      <div
                        className={cn(
                          "w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors shadow-inner",
                          !notification.read
                            ? "bg-blue-50 border-blue-100 text-blue-600"
                            : "bg-slate-50 border-slate-100 text-slate-400"
                        )}
                      >
                        {getNotificationIcon(notification.type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-3">
                            <h3
                              className={cn(
                                "text-xl font-black tracking-tight leading-none uppercase",
                                !notification.read
                                  ? "text-slate-800"
                                  : "text-slate-500"
                              )}
                            >
                              {notification.title}
                            </h3>

                            {!notification.read && (
                              <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                            <Clock className="w-3 h-3" />

                            {new Date(notification.createdAt).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric"
                              }
                            )}

                            {" • "}

                            {new Date(notification.createdAt).toLocaleTimeString(
                              undefined,
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false
                              }
                            )}
                          </div>
                        </div>

                        <p
                          className={cn(
                            "text-sm font-medium leading-relaxed mb-6",
                            !notification.read
                              ? "text-slate-600"
                              : "text-slate-400"
                          )}
                        >
                          {notification.message}
                        </p>

                        {notification.data?.pnr && (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100 text-slate-500 mb-6">
                            <p className="text-[10px] font-black uppercase tracking-tighter">
                              Reference Node
                            </p>

                            <div className="h-3 w-[1px] bg-slate-200" />

                            <p className="text-xs font-mono font-black">
                              {notification.data.pnr}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-between border-t border-slate-50 pt-6">
                          <div className="flex gap-2">
                            {!notification.read && (
                              <button
                                onClick={() => markAsRead(notification._id)}
                                className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-xl transition-all font-black uppercase tracking-widest text-[9px] active:scale-95"
                              >
                                Resolve Entry
                              </button>
                            )}

                            <button
                              onClick={() =>
                                deleteNotification(notification._id)
                              }
                              className="px-4 py-2 bg-white border border-slate-100 text-slate-400 hover:border-red-500 hover:text-red-600 rounded-xl transition-all font-black uppercase tracking-widest text-[9px] active:scale-95"
                            >
                              Archive
                            </button>
                          </div>

                          <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-blue-200 transition-colors" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="mt-20 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-300">
            CENTRAL DISPATCH LOG • END TO END ENCRYPTED
          </p>
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;
