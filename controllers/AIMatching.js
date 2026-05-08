const { isAuthenticated } = require("../middlewares/user/auth");
const HelpRequest = require("../models/user/HelpRequests");
const User = require("../models/user/User");
const express = require("express");
const router = express.Router();

// ✅ AI Matching Endpoint
router.get("/ai/match/:requestId", isAuthenticated, async (req, res) => {
  try {
    const requestId = req.params.requestId;

    // 1. Get the help request
    const request = await HelpRequest.findById(requestId).populate("creator");
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    }

    // 2. Find potential helpers
    const users = await User.find({
      _id: { $ne: request.creator._id }, // exclude creator
      isBanned: { $ne: true }, // exclude banned users
      kynBalance: { $gte: 0 }, // must not be negative
    });

    // 3. Scoring Algorithm
    const scoredUsers = users.map((user) => {
      let score = 0;

      // Match by tags/skills
      if (user.skills?.some((skill) => request.tags.includes(skill))) {
        score += 50;
      }

      // Location match (simplified: same city)
      if (user.location?.city === request.location?.city) {
        score += 20;
      }

      // Availability (user says they are online/active)
      if (user.isAvailable) {
        score += 15;
      }

      // Kyn history (generous helpers rank higher)
      score += Math.min(user.totalHelped * 2, 15);

      return { user, score };
    });

    // 4. Sort helpers by score (highest first)
    scoredUsers.sort((a, b) => b.score - a.score);

    // 5. Return top N matches
    const bestMatches = scoredUsers.slice(0, 5).map((s) => ({
      userId: s.user._id,
      name: s.user.firstName,
      score: s.score,
      skills: s.user.skills,
      location: s.user.location,
    }));

    res.json({
      success: true,
      requestId,
      matches: bestMatches,
    });
  } catch (error) {
    console.error("AI Match Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

module.exports = router;
