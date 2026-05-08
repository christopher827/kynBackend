const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    // Who is reporting
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The user being reported (optional, if it's a user-specific report)
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Related help request (optional, if report is about a request)
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpRequest",
    },

    // Reason / type of report
    type: {
      type: String,
      enum: ["abuse", "spam", "fraud", "misconduct", "other"],
      required: true,
    },

    // Details of the report
    description: {
      type: String,
      required: true,
    },

    // Whether the report has been resolved by admin
    resolved: {
      type: Boolean,
      default: false,
    },

    // Admin comments when resolving
    resolutionComment: {
      type: String,
    },

    // Optional Kyn penalties or rewards
    KynAdjustment: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Report", reportSchema);
