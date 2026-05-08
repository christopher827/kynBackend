const mongoose = require("mongoose");

const helpRequestSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  urgency: { type: String, enum: ["low", "medium", "high"], default: "low" },
  KynReward: { type: Number, default: 0 },
  interests: [{ type: String }],
  location: { type: String },
  isVirtual: { type: Boolean, default: false },
  fulfilled: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  responses: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  rewardLocked: { type: Number, default: 0 },
  respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  createdAt: { type: Date, default: Date.now },
  fulfilledAt: { type: Date },
});

module.exports = mongoose.model("HelpRequest", helpRequestSchema);
