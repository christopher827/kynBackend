const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: "HelpRequest", required: true },
  from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },  
  to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },  
  amount: { type: Number, default: 0 },
  type: { type: String, enum: ["debit", "credit","purchase"] },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Transaction", transactionSchema);
