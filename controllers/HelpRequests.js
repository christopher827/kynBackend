const { isAuthenticated } = require("../middlewares/user/auth");
const User = require("../models/user/User");
const HelpRequest = require("../models/user/HelpRequests");
const enqueueEmail = require("../utils/inMemoryQueue");
const Feedback = require("../models/user/Feedback");
const Transaction = require("../models/user/KynHistory");
const express = require("express");
const router = express.Router();

//create a request
router.post("/requests/create", isAuthenticated, async (req, res) => {
  try {
    const {
      title,
      description,
      urgency,
      KynReward,
      interests,
      location,
      isVirtual,
    } = req.body;

    if (!title || !urgency || !KynReward) {
      return res
        .status(400)
        .json({ message: "Title, urgency and KynReward are required" });
    }

    const creator = await User.findById(req.user._id);
    if (!creator) {
      return res.status(404).json({ message: "User not found" });
    }

    if (creator.kynBalance < KynReward) {
      return res.status(400).json({ message: "Insufficient Kyn balance" });
    }

    creator.kynBalance -= KynReward;
    await creator.save();

    const request = await HelpRequest.create({
      title,
      description,
      urgency,
      KynReward,
      rewardLocked: KynReward,
      interests,
      location,
      isVirtual,
      createdBy: creator._id,
    });

    // --- Enqueue notifications asynchronously ---
    if (interests && interests.length > 0) {
      console.log("Incoming interests:", interests);

      const matchedUsers = await User.find({
        _id: { $ne: creator._id },
        interests: { $in: interests },
      }).select("email firstName lastName interests");

      console.log("Matched users:", matchedUsers.length);
      console.log("Matched users:", matchedUsers);

      // Use for...of to support await
      for (const user of matchedUsers) {
        console.log("Queueing email for:", user.email);

        enqueueEmail({
          email: user.email,
          subject: `New Help Request: ${title}`,
          template: "../mails/NewReq.ejs",
          data: {
            firstName: user.firstName,
            requestTitle: title,
            KynReward,
            description,
          },
        });
      }
    }

    res.status(201).json({
      success: true,
      message: "Help request created and reward locked",
      request,
      creator: {
        id: creator._id,
        username: creator.username,
        Kyn: creator.Kyn,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

//get unfulfilled reqs
router.get("/unfulfilled-reqs", async (req, res) => {
  try {
    const requests = await HelpRequest.find({ fulfilled: false })
      .sort({ createdAt: -1 })
      .populate("createdBy", "firstName lastName avatar");

    res.status(200).json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
//get fulfilled reqs
router.get("/fulfilled-reqs", async (req, res) => {
  try {
    const requests = await HelpRequest.find({ fulfilled: true })
      .sort({ createdAt: -1 })
      .populate("createdBy", "firstName lastName avatar");

    res.status(200).json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/reqs-for-you", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("interests");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userInterests = user.interests || [];

    let query = {
      fulfilled: false,
      createdBy: { $ne: req.user._id },
    };

    if (userInterests.length > 0) {
      query.interests = { $in: userInterests };
    }

    const requests = await HelpRequest.find(query)
      .populate("createdBy", "firstName avatar")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      requests,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
//more info about a particular req
router.get("/requests/:id", async (req, res) => {
  try {
    const request = await HelpRequest.findById(req.params.id).populate(
      "createdBy",
      "firstName lastName avatar",
    );

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    res.status(200).json({ success: true, request });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// accept a response
router.put(
  "/accept-help/:id/accept/:responderId",
  isAuthenticated,
  async (req, res) => {
    try {
      const request = await HelpRequest.findById(req.params.id);

      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      if (request.createdBy.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: "Only the creator can accept a responder" });
      }

      if (
        !request.responses?.some(
          (id) => id.toString() === req.params.responderId,
        )
      ) {
        return res
          .status(400)
          .json({ message: "This user has not responded to your request" });
      }

      request.respondedBy = req.params.responderId;

      await request.save();
      res.status(200).json({
        success: true,
        message: "Responder accepted successfully",
        request,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
);

//declines a response
router.put(
  "/decline-help/:id/decline/:responderId",
  isAuthenticated,
  async (req, res) => {
    try {
      const request = await HelpRequest.findById(req.params.id);

      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      // Only the creator can decline
      if (request.createdBy.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: "Only the creator can decline a responder" });
      }

      // Check if responder is in the responses list
      if (
        !request.responses?.some(
          (id) => id.toString() === req.params.responderId,
        )
      ) {
        return res
          .status(400)
          .json({ message: "This user has not responded to your request" });
      }

      // Prevent declining someone already accepted
      if (request.respondedBy?.toString() === req.params.responderId) {
        return res.status(400).json({
          message:
            "You cannot decline a responder who has already been accepted",
        });
      }

      // Remove the responder
      request.responses = request.responses.filter(
        (id) => id.toString() !== req.params.responderId,
      );

      await request.save();

      res.status(200).json({
        success: true,
        message: "Responder declined successfully",
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
);

// Mark a help request as fulfilled and award Kyn
router.put("/requests/:id/fulfill", isAuthenticated, async (req, res) => {
  try {
    const request = await HelpRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Only the creator can mark this request as fulfilled",
      });
    }

    if (request.fulfilled) {
      return res
        .status(400)
        .json({ message: "This request is already fulfilled" });
    }

    if (!request.respondedBy) {
      return res
        .status(400)
        .json({ message: "No responder has been accepted for this request" });
    }

    const responder = await User.findById(request.respondedBy);
    const creator = await User.findById(request.createdBy);

    if (!responder || !creator) {
      return res.status(404).json({ message: "User not found" });
    }

    const amount = request.rewardLocked;
    console.log(amount);

    // Save single transaction
    await Transaction.create({
      request: request._id,
      from: creator._id,
      to: responder._id,
      amount,
      description: `Kyn transfer for fulfilling request "${request.title}"`,
    });

    // Transfer Kyn
    responder.kynBalance += amount;
    await responder.save();

    // Mark as fulfilled and reset locked reward
    request.fulfilled = true;
    request.rewardLocked = 0;
    await request.save();

    enqueueEmail({
      email: responder.email,
      subject: "Kyn Credited! 🎉",
      template: "KynCredited.ejs",
      data: {
        firstName: responder.firstName,
        requestTitle: request.title,
        KynReward: amount,
      },
    });

    res.status(200).json({
      success: true,
      message: "Request fulfilled, Kyn transferred, and transaction recorded",
      request,
      responder: {
        id: responder._id,
        username: responder.username,
        Kyn: responder.Kyn,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/feedback", isAuthenticated, async (req, res) => {
  try {
    const { requestId, to, rating, comment } = req.body;

    const request = await HelpRequest.findById(requestId);
    if (!request || !request.fulfilled) {
      return res
        .status(400)
        .json({ message: "Request not found or not yet fulfilled" });
    }

    const existing = await Feedback.findOne({
      request: requestId,
      from: req.user.id,
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "You already left feedback for this request" });
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
