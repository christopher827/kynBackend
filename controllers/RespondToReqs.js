const { isAuthenticated } = require("../middlewares/user/auth");
const User = require("../models/user/User");
const enqueueEmail = require("../utils/inMemoryQueue");
const HelpRequest = require("../models/user/HelpRequests");
const express = require("express");
const router = express.Router();

router.put("/respond-to-help/:id", isAuthenticated, async (req, res) => {
  try {
    const request = await HelpRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.fulfilled) {
      return res.status(400).json({ message: "Request already fulfilled" });
    }

    if (request.createdBy.toString() === req.user.id) {
      return res.status(400).json({ message: "You cannot respond to your own request" });
    }

    if (request.responses?.includes(req.user.id)) {
      return res.status(400).json({ message: "You have already responded to this request" });
    }

    request.responses = request.responses || [];
    request.responses.push(req.user.id);

    await request.save();
  const responder = await User.findById(req.user._id);  // user who responded
  const creator = await User.findById(request.createdBy); // request owner

        // 1️⃣ Email the responder ----------------------------------
    enqueueEmail({
      email: responder.email,
      subject: "You responded to a request",
      template: "ResponseConfirmation.ejs",
      data: {
        firstName: responder.firstName,
        requestTitle: request.title,
      },
    });

    // 2️⃣ Email the request creator -----------------------------
    enqueueEmail({
      email: creator.email,
      subject: "Someone responded to your request",
      template: "NewResponse.ejs",
      data: {
        firstName: creator.firstName,
        requestTitle: creator.title,
      },
    });

    res.status(200).json({ 
      success: true, 
      message: "You have responded to this request. The creator will review your response and get back to you shortly.", 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put("/requests/:id/fulfill", isAuthenticated, async (req, res) => {
  try {
    const request = await HelpRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.createdBy.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Not authorized to fulfill this request" });
    }

    if (request.fulfilled) {
      return res.status(400).json({ message: "Already fulfilled" });
    }

    request.fulfilled = true;
    request.fulfilledAt = new Date();
    await request.save();

    res.status(200).json({ success: true, message: "Request marked as fulfilled" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/feedback", isAuthenticated, async (req, res) => {
  try {
    const { requestId, to, rating, comment } = req.body;

    const request = await HelpRequest.findById(requestId);
    if (!request || !request.fulfilled) {
      return res.status(400).json({ message: "Request not found or not yet fulfilled" });
    }

    const existing = await Feedback.findOne({ request: requestId, from: req.user.id });
    if (existing) {
      return res.status(400).json({ message: "You already left feedback for this request" });
    }

    const feedback = await Feedback.create({
      request: requestId,
      from: req.user.id,
      to,
      rating,
      comment,
    });

    res.status(201).json({ success: true, feedback });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;