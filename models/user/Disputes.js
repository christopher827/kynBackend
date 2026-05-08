const mongoose = require("mongoose");

const disputeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    request: { type: mongoose.Schema.Types.ObjectId, ref: "Request", required: true }, 
    reason: { type: String, required: true },
    status: { type: String, enum: ["open", "in-progress", "resolved", "rejected"], default: "open" },
    resolution: { type: String }, 
  },
  { timestamps: true }
);

module.exports = mongoose.model("Dispute", disputeSchema);
