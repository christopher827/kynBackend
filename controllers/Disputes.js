const { isAuthenticated } = require("../middlewares/user/auth");
const Dispute = require("../models/user/Disputes");
const express = require("express");
const router = express.Router();

router.post("/dispute", isAuthenticated, async (req, res) => {
  try {
    const { requestId, reason } = req.body;

    if (!requestId || !reason) {
      return res.status(400).json({ message: "Request ID and reason are required." });
    }

    const dispute = new Dispute({
      user: req.user._id,
      request: requestId,
      reason,
    });

    await dispute.save();
    res.status(201).json({ success: true, dispute });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/mine", isAuthenticated, async (req, res) => {
  try {
    const disputes = await Dispute.find({ user: req.user._id })
      .populate("request", "title status")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, disputes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id)
      .populate("request", "title status")
      .populate("user", "firstName email");

    if (!dispute) return res.status(404).json({ message: "Dispute not found" });

    if (dispute.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not allowed to view this dispute" });
    }

    res.status(200).json({ success: true, dispute });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;