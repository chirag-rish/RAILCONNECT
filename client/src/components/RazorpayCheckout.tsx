
"use client";

import { useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/constants";
import { toast } from "react-hot-toast";

interface RazorpayCheckoutProps {
  amount: number;
  bookingId: string;
  onSuccess: (bookingId: string) => void;
  onFailure?: () => void;
  onStart?: () => void;
  label?: string;
}

interface RazorpayOrder {
  keyId: string;
  amount: number;
  currency: string;
  orderId: string;
}

interface RazorpayPaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayFailureResponse {
  error: {
    description: string;
  };
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: {
    name: string;
    email: string;
  };
  theme: {
    color: string;
  };
  handler: (response: RazorpayPaymentResponse) => void | Promise<void>;
  modal: {
    ondismiss: () => void;
  };
}

interface RazorpayInstance {
  open: () => void;
  on: (
    event: "payment.failed",
    handler: (response: RazorpayFailureResponse) => void
  ) => void;
}

interface RazorpayConstructor {
  new (options: RazorpayOptions): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay: RazorpayConstructor;
  }
}

export default function RazorpayCheckout({
  amount,
  bookingId,
  onSuccess,
  onFailure,
  onStart,
  label = "Pay Now",
}: RazorpayCheckoutProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    if (!user?.token) {
      toast.error("Please login to continue");
      return;
    }

    setLoading(true);
    onStart?.();

    try {
      const config = {
        headers: { Authorization: `Bearer ${user.token}` },
      };

      const { data: order } = await axios.post<RazorpayOrder>(
        `${API_URL}/payment/create-order`,
        { amount, bookingId },
        config
      );

      const options: RazorpayOptions = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "RailConnect",
        description: "Train Ticket Booking",
        order_id: order.orderId,
        prefill: {
          name: user.name,
          email: user.email,
        },
        theme: { color: "#2563eb" },
        handler: async (response) => {
          try {
            await axios.post(
              `${API_URL}/payment/verify`,
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                bookingId,
              },
              config
            );

            toast.success("Payment Successful! Booking Confirmed 🎉");
            onSuccess(bookingId);
          } catch {
            toast.error("Payment verification failed. Contact support.");
            onFailure?.();
          }
        },
        modal: {
          ondismiss: () => {
            toast("Payment cancelled", { icon: "⚠️" });
            setLoading(false);
            onFailure?.();
          },
        },
      };

      const rzp = new window.Razorpay(options);

      rzp.on("payment.failed", (response) => {
        toast.error(`Payment failed: ${response.error.description}`);
        setLoading(false);
        onFailure?.();
      });

      rzp.open();
    } catch (error: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;

      toast.error(message || "Payment initiation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePayment}
      disabled={loading}
      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {loading ? (
        <>
          <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
          Processing...
        </>
      ) : (
        <>
          <span>💳</span> {label} ₹{amount}
        </>
      )}
    </button>
  );
}
