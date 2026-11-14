const mongoose = require("mongoose");

const SupportTicketSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    subject: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ["refund", "booking", "technical", "other"],
      required: true,
    },
    description: String,
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved", "closed"],
      default: "open",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    messages: [
      {
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        message: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    resolution: String,
    resolvedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);
