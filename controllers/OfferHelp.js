const { isAuthenticated } = require("../middlewares/user/auth");
const User = require("../models/user/User");
const HelpRequest = require("../models/user/HelpRequests");
const express = require("express");
const router = express.Router();

// ✅ Fulfill a request and earn Kyn
router.post("/offer-help", async (req, res) => {
  try {
    const { helperId, proof } = req.body;
    const requestId = req.params.id;

    // 1. Find the request
    const request = await HelpRequest.findById(requestId);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    }

    // 2. Check if already fulfilled
    if (request.status === "fulfilled") {
      return res
        .status(400)
        .json({ success: false, message: "Request already fulfilled" });
    }

    // 3. Prevent creator from fulfilling own request
    if (request.creator.toString() === helperId) {
      return res
        .status(400)
        .json({
          success: false,
          message: "You cannot fulfill your own request",
        });
    }

    // 4. Find helper user
    const helper = await User.findById(helperId);
    if (!helper) {
      return res
        .status(404)
        .json({ success: false, message: "Helper not found" });
    }

    // 5. Mark request as fulfilled
    request.status = "fulfilled";
    request.fulfilledBy = helperId;
    request.proof = proof || null;
    await request.save();

    // 6. Reward Kyn
    const earnedKyn = request.rewardKyn || 20; // default reward
    helper.kynBalance += earnedKyn;
    await helper.save();

    // 7. Respond
    res.json({
      success: true,
      message: "Request fulfilled successfully!",
      earnedKyn,
      newBalance: helper.kynBalance,
    });
  } catch (error) {
    console.error("Error fulfilling request:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

module.exports = router;
