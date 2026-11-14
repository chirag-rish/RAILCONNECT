const mongoose = require("mongoose");

const AILogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    message: String,
    response: String,
    intent: String,
    tokens: Number,
    responseTime: Number,
    failureReason: String,
    category: String,
    feedback: {
      rating: Number,
      helpful: Boolean,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AILog", AILogSchema);
