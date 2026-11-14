
"use client";

import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Plus, Send, History, X,
  ArrowUpRight, ArrowDownLeft, TrendingUp, ShieldCheck
} from "lucide-react";
import { API_URL } from "@/lib/constants";
import BackButton from "@/components/BackButton";

interface WalletData {
  balance: number;
  totalSpent: number;
  totalAdded: number;
}

interface Transaction {
  _id: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  createdAt: string;
}

interface WalletResponse {
  balance?: number;
  walletBalance?: number;
  totalSpent?: number;
  totalAdded?: number;
}

interface TransactionsResponse {
  transactions?: Transaction[];
}

interface MethodCardProps {
  active: boolean;
  onClick: () => void;
  label: string;
  desc: string;
}

export default function WalletPage() {
  const { token, user, logout } = useAuth();

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [amount, setAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("upi");

  const fetchWalletData = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const [walletRes, transRes] = await Promise.all([
        axios.get<WalletResponse>(`${API_URL}/wallet`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get<TransactionsResponse | Transaction[]>(
          `${API_URL}/wallet/transactions`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        ),
      ]);

      setWallet({
        balance: walletRes.data.balance || walletRes.data.walletBalance || 0,
        totalSpent: walletRes.data.totalSpent || 0,
        totalAdded: walletRes.data.totalAdded || 0,
      });

      const transactionData = transRes.data;

      setTransactions(
        Array.isArray(transactionData)
          ? transactionData
          : transactionData.transactions || []
      );
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        toast.error("Session expired, please log in again.");
        logout();
        return;
      }

      console.error("Wallet error:", error);
      toast.error("Failed to sync wallet");
      setWallet({ balance: 0, totalSpent: 0, totalAdded: 0 });
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    void fetchWalletData();
  }, [fetchWalletData]);

  const handleAddMoney = async (e: FormEvent) => {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setProcessing(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await axios.post(
        `${API_URL}/wallet/add`,
        { amount: parseFloat(amount), paymentMethod },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`₹${amount} added successfully!`);
      setShowAddMoney(false);
      setAmount("");
      await fetchWalletData();
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : undefined;

      toast.error(message || "Transaction failed");
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            Accessing Financial Terminal...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 text-slate-900 font-sans p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <BackButton />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-50 to-slate-100 border border-blue-100 shadow-sm">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">
              Secure Audit Logs
            </span>
          </div>
        </div>

        <header className="mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight text-blue-900 mb-2 drop-shadow-sm">
            Financial <span className="text-blue-600">Terminal</span>
          </h1>
          <p className="text-slate-500 font-medium bg-blue-50/60 rounded-xl px-4 py-2 inline-block shadow-sm">
            Manage your digital transit assets and audit history
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative aspect-[1.586/1] rounded-3xl overflow-hidden shadow-2xl shadow-blue-100 group border border-blue-100 bg-gradient-to-br from-blue-100/80 via-white to-slate-100"
            >
              <div className="absolute inset-0 bg-slate-900/90 group-hover:bg-slate-800/90 transition-colors duration-500" />
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.08)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_5s_infinite]" />

              <div className="relative z-10 h-full p-8 flex flex-col justify-between text-white">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400 mb-1">
                      Platinum Registry
                    </span>
                    <div className="h-6 w-10 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-lg shadow-inner" />
                  </div>
                  <Wallet className="w-8 h-8 text-white/20" />
                </div>

                <div>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
                    Liquid Balance
                  </p>
                  <h2 className="text-4xl font-black font-mono tracking-tight group-hover:scale-105 transition-transform origin-left duration-500">
                    {formatCurrency(wallet?.balance || 0)}
                  </h2>
                </div>

                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">
                      Terminal Operator
                    </p>
                    <p className="font-bold text-sm tracking-wide uppercase">
                      {user?.name || "System User"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">
                      Access Code
                    </p>
                    <p className="font-mono text-xs opacity-60">
                      **** **** **** {user?._id?.slice(-4)}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setShowAddMoney(true)}
                className="flex items-center justify-center gap-3 p-5 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-blue-100 group"
              >
                <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                Add Money
              </button>

              <button
                disabled
                className="flex items-center justify-center gap-3 p-5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-300 font-black uppercase tracking-widest text-xs cursor-not-allowed"
              >
                <ArrowUpRight className="w-5 h-5" />
                Withdraw
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-red-50 via-white to-slate-50 border border-slate-200 shadow-sm group hover:border-red-200 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-red-50 rounded-lg text-red-600">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">
                    Usage
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">
                  Total Expense
                </p>
                <p className="text-xl font-black text-slate-800 group-hover:text-red-600 transition-colors">
                  {formatCurrency(wallet?.totalSpent || 0)}
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-br from-green-50 via-white to-slate-50 border border-slate-200 shadow-sm group hover:border-green-200 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-green-50 rounded-lg text-green-600">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">
                    Income
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">
                  Total Inflow
                </p>
                <p className="text-xl font-black text-slate-800 group-hover:text-green-600 transition-colors">
                  {formatCurrency(wallet?.totalAdded || 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50 rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-blue-50/60 to-slate-50/60">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <History className="w-5 h-5 text-slate-400" />
                  Audit Ledger
                </h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {transactions.length} Records found
                </span>
              </div>

              <div className="flex-1 max-h-[420px] overflow-y-auto p-4 space-y-2 bg-gradient-to-b from-white/80 to-blue-50/60 overscroll-contain pr-2">
                {transactions.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-4">
                    <TrendingUp className="w-16 h-16 opacity-10" />
                    <p className="font-bold uppercase tracking-widest text-xs">
                      No activity records found
                    </p>
                  </div>
                ) : (
                  transactions.map((t, i) => (
                    <motion.div
                      key={t._id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-4 rounded-2xl hover:bg-slate-50 transition flex items-center justify-between border border-transparent hover:border-slate-100 group"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg shadow-inner ${
                            t.type === "credit"
                              ? "bg-green-50 text-green-600"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {t.type === "credit" ? (
                            <ArrowDownLeft className="w-5 h-5" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5" />
                          )}
                        </div>

                        <div>
                          <p className="font-bold text-slate-800 group-hover:text-blue-600 transition uppercase tracking-tight text-sm">
                            {t.description}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-1">
                            {new Date(t.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}{" "}
                            •{" "}
                            {new Date(t.createdAt).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p
                          className={`font-mono font-black text-base ${
                            t.type === "credit"
                              ? "text-green-600"
                              : "text-slate-800"
                          }`}
                        >
                          {t.type === "credit" ? "+" : "-"}
                          {formatCurrency(t.amount)}
                        </p>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mt-1">
                          Settled
                        </p>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-gradient-to-r from-blue-50/60 to-slate-50/60">
                <button className="w-full text-center text-[10px] font-bold text-slate-400 hover:text-blue-600 uppercase tracking-[0.3em] transition-colors">
                  Download Full Statement (PDF)
                </button>
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showAddMoney && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setShowAddMoney(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden"
              >
                <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <h3 className="font-black text-2xl text-slate-800 tracking-tight">
                      Top Up
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                      Instant Settlement
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddMoney(false)}
                    className="p-2 hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <form onSubmit={handleAddMoney} className="p-8 space-y-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] px-1">
                      Amount Registry (INR)
                    </label>

                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 text-2xl font-black">
                        ₹
                      </span>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-6 pl-12 pr-6 text-3xl font-black text-slate-800 focus:border-blue-500 focus:bg-white outline-none transition-all"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-2">
                      {[500, 1000, 5000].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setAmount(val.toString())}
                          className="px-4 py-2 rounded-xl bg-slate-50 text-slate-600 text-xs font-bold border border-slate-100 hover:border-blue-400 hover:text-blue-600 transition-all active:scale-95"
                        >
                          +₹{val}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] px-1">
                      Payment Channel
                    </label>

                    <div className="grid grid-cols-2 gap-4">
                      <MethodCard
                        active={paymentMethod === "upi"}
                        onClick={() => setPaymentMethod("upi")}
                        label="Unified (UPI)"
                        desc="Instant Pay"
                      />
                      <MethodCard
                        active={paymentMethod === "card"}
                        onClick={() => setPaymentMethod("card")}
                        label="Bank Card"
                        desc="Visa/Master"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={processing}
                    className="w-full py-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {processing ? (
                      <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Authorize Pay
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function MethodCard({ active, onClick, label, desc }: MethodCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col gap-2 ${
        active
          ? "bg-blue-50 border-blue-500 shadow-lg shadow-blue-100"
          : "bg-white border-slate-100 hover:border-slate-200"
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          active ? "border-blue-600 bg-blue-600" : "border-slate-200"
        }`}
      >
        {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>
      <div>
        <p
          className={`text-[11px] font-black uppercase tracking-tight ${
            active ? "text-blue-800" : "text-slate-600"
          }`}
        >
          {label}
        </p>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
          {desc}
        </p>
      </div>
    </div>
  );
}
