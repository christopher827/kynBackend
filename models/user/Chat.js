const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }], 
  isDeleted: { type: Boolean, default: false }
});

const chatSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: "HelpRequest", required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "user", required: true }],
  messages: [messageSchema],
  read: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Chat", chatSchema);