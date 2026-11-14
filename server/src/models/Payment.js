const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    method: {
      type: String,
      enum: ["card", "wallet", "upi", "netbanking"],
      required: true,
    },
    transactionId: {
      type: String,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundReason: String,
    refundedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", PaymentSchema);
