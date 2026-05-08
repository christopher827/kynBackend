const { isAuthenticated } = require("../middlewares/user/auth");
const User = require("../models/user/User");
const Transactions = require("../models/user/KynHistory");
const HelpRequest = require("../models/user/HelpRequests");
const { sendToken } = require("../utils/JwtToken");
const sendMailToNewUsers = require("../utils/SendMail");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const streamifier = require("streamifier");
const cloudinary = require("cloudinary");
const express = require("express");
const storage = multer.memoryStorage();
const upload = multer({ storage });
const router = express.Router();

router.post("/register", async (req, res) => {
  const { email, password, role, fullname } = req.body;

  try {
    const customer = await User.findOne({ email });
    if (customer) {
      return res.status(400).json({ message: "User already exists" });
    }

    const generateKynTag = async (fullname) => {
       fullname?.trim().split(" ")[0];

      let base = fullname
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 10);

      if (!base) base = "user";

      let kynTag;
      let exists = true;

      while (exists) {
        const random = Math.floor(1000 + Math.random() * 9000); // 4-digit
        kynTag = `${base}${random}`;

        const user = await User.findOne({ kynTag });
        exists = !!user;
      }

      return kynTag;
    };
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const kynTag = await generateKynTag(fullname);

    const verificationCode = generateVerificationCode();
    const verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);

    const user = await User.create({
      email,
      password: hash,
      kynTag,
      role,
      fullname,
      isVerified: false,
      verificationCode,
      verificationCodeExpires,
    });

    await sendMailToNewUsers({
      email: user.email,
      subject: "Verify Your Kyn Account",
      template: "../mails/VerifyCode.ejs",
      data: {
        FullName: user.fullname || "User",
        verificationCode,
        KynTag: user.kynTag,
      },
    });

    res.status(200).json({ user });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
});

router.post("/verify-code", async (req, res) => {
  const { userId, code } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isVerified)
      return res.status(400).json({ message: "User already verified" });

    if (user.verificationCode !== code) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    if (user.verificationCodeExpires < new Date()) {
      return res.status(400).json({ message: "Verification code expired" });
    }

    user.isVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpires = null;
    await user.save();

    await sendMailToNewUsers({
      email: user.email,
      subject: "Welcome to Kyn",
      template: "../mails/NewUsers.ejs",
      data: {
        KynTag: user.kynTag,
        fullname: user.fullname,
      },
    });

    res.status(200).json({ message: "Email verified successfully!" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/resend-code", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isVerified)
      return res.status(400).json({ message: "User already verified" });

    const verificationCode = generateVerificationCode();
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry
    await user.save();

    await sendMailToNewUsers({
      email: user.email,
      subject: "Verify Your Kyn Account",
      template: "../mails/VerifyCode.ejs",
      data: {
        fullname: user.fullname || "User",
        verificationCode,
        KynTag: user.kynTag,
      },
    });

    res.json({ message: "Verification code resent to your email" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "All fields must be filled" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials!" });
    }

    if (user.isBlocked === true) {
      return res.status(400).json({ message: "Account currently blocked" });
    }
    if (user.isDeleted === true) {
      return res.status(400).json({ message: "Account Deactivated by you" });
    }
    if (!user.isVerified) {
      return res
        .status(403)
        .json({ message: "Please verify your email before logging in." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: "Invalid credentials!" });
    }

    sendToken(user, 200, res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/logout", isAuthenticated, async (req, res) => {
  try {
    res.cookie("token", null, {
      expires: new Date(0),
      httpOnly: true,
      sameSite: "none",
      secure: true,
    });
    res.status(201).json({
      success: true,
      message: "Logged out successful",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    // Always respond success to prevent email enumeration
    const user = await User.findOne({ email });

    if (user) {
      // Generate 6-digit code
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Set expiry = 15 Minutes
      const expiry = Date.now() + 15 * 60 * 1000;

      user.resetPasswordCode = resetCode;
      user.resetPasswordExpires = expiry;

      await user.save();

      // Prepare email data
      const data = { code: resetCode };

      // Send email
      await sendMailToNewUsers({
        email: user.email,
        subject: "Your Password Reset Code",
        template: "../mails/ResetPasswordCode.ejs",
        data,
      });
    }

    return res.status(200).json({
      message: "If this email exists, a reset code has been sent.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Server error." });
  }
});

router.post("/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;

  try {
    // 1. Ensure all fields are provided
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({
      email,
      resetPasswordCode: code,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 4. Update password + clear code fields
    user.password = hashedPassword;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    return res.json({
      message: "Password reset successful. You can now log in.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/edit-profile", isAuthenticated, async (req, res) => {
  try {
    const { fullname, bio, location, interests, skills } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (fullname !== undefined) user.fullname = fullname;
    if (bio !== undefined) user.bio = bio;
    if (location !== undefined) user.location = location;
    if (skills !== undefined) user.skills = skills;
    if (interests !== undefined) user.interests = interests;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put(
  "/upload-avatar",
  isAuthenticated,
  upload.single("avatar"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      if (user.avatar?.public_id) {
        await cloudinary.v2.uploader.destroy(user.avatar.public_id);
      }

      const uploadStream = () =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.v2.uploader.upload_stream(
            {
              folder: "avatars",
              width: 150,
              crop: "scale",
            },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            },
          );

          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });

      const result = await uploadStream();

      user.avatar = {
        public_id: result.public_id,
        url: result.secure_url,
      };

      await user.save();

      res.status(200).json({
        success: true,
        message: "Avatar uploaded successfully",
        user: {
          avatar: user.avatar,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server Error: " + error.message });
    }
  },
);

router.put(
  "/update-avatar",
  isAuthenticated,
  upload.single("avatar"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (!req.file)
        return res.status(400).json({ message: "No file uploaded" });

      // Destroy old avatar if exists
      if (user.avatar?.public_id) {
        await cloudinary.v2.uploader.destroy(user.avatar.public_id);
      }

      // Upload stream
      const uploadFromBuffer = (fileBuffer) => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.v2.uploader.upload_stream(
            { folder: "avatars", width: 150, crop: "scale" },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            },
          );
          streamifier.createReadStream(fileBuffer).pipe(stream);
        });
      };

      const uploaded = await uploadFromBuffer(req.file.buffer);

      user.avatar = {
        public_id: uploaded.public_id,
        url: uploaded.secure_url,
      };

      await user.save();

      res.status(200).json({
        success: true,
        message: "Avatar updated successfully",
        avatar: user.avatar,
      });
    } catch (error) {
      res.status(500).json({ message: "Server Error: " + error.message });
    }
  },
);

router.get("/kyn-balance", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("kynBalance");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({
      success: true,
      kynBalance: user.kynBalance,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error: " + error.message });
  }
});

router.put("/update-skills-interests", isAuthenticated, async (req, res) => {
  try {
    const { skills, interests } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (skills) user.skills = skills;
    if (interests) user.interests = interests;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Skills & Interests updated",
      data: {
        skills: user.skills,
        interests: user.interests,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put("/update-location", isAuthenticated, async (req, res) => {
  try {
    const { location } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.location = location;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Location updated",
      location: user.location,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put("/update-reputation", isAuthenticated, async (req, res) => {
  try {
    const { reputation, badge } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (reputation) user.reputation += reputation;

    if (badge && !user.badges.includes(badge)) {
      user.badges.push(badge);
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "Reputation & badges updated",
      data: {
        reputation: user.reputation,
        badges: user.badges,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/me", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const userFromDB = await User.findById(userId);
    if (userFromDB) {
      res.status(200).json({
        success: true,
        user: userFromDB,
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/getDashboard", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const includeTrends = req.query.includeTrends === "true";
    const transactionsPage = parseInt(req.query.transactionsPage) || 1;
    const transactionsLimit = parseInt(req.query.transactionsLimit) || 10;
    const recentRequestsLimit = parseInt(req.query.recentRequestsLimit) || 5;
    const recentResponsesLimit = parseInt(req.query.recentResponsesLimit) || 5;

    // Fetch user basic info
    const user = await User.findById(userId).select(
      "Kyn kynBalance fullname lastName",
    );

    // Help requests
    const totalRequests = await HelpRequest.countDocuments({
      createdBy: userId,
    });
    const fulfilledRequests = await HelpRequest.countDocuments({
      createdBy: userId,
      fulfilled: true,
    });
    const pendingRequests = totalRequests - fulfilledRequests;
    const recentRequests = await HelpRequest.find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .limit(recentRequestsLimit);

    // Responses made by user
    const totalResponses = await HelpRequest.countDocuments({
      responses: userId,
    });
    const acceptedResponses = await HelpRequest.countDocuments({
      respondedBy: userId,
      fulfilled: true,
    });
    const recentAccepted = await HelpRequest.find({
      respondedBy: userId,
      fulfilled: true,
    })
      .sort({ updatedAt: -1 })
      .limit(recentResponsesLimit);

    // Transactions (paginated)
    const transactions = await Transactions.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip((transactionsPage - 1) * transactionsLimit)
      .limit(transactionsLimit)
      .lean();

    // Trends
    let trends = {};
    if (includeTrends) {
      trends.KynPerWeek = await Transactions.aggregate([
        { $match: { user: mongoose.Types.ObjectId(userId), type: "credit" } },
        {
          $group: {
            _id: { $isoWeek: "$createdAt" },
            totalKyn: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      trends.requestsPerMonth = await HelpRequest.aggregate([
        { $match: { createdBy: mongoose.Types.ObjectId(userId) } },
        {
          $group: { _id: { $month: "$createdAt" }, totalRequests: { $sum: 1 } },
        },
        { $sort: { _id: 1 } },
      ]);

      trends.acceptedResponsesPerWeek = await HelpRequest.aggregate([
        {
          $match: {
            respondedBy: mongoose.Types.ObjectId(userId),
            fulfilled: true,
          },
        },
        {
          $group: {
            _id: { $isoWeek: "$updatedAt" },
            totalAccepted: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    }

    res.status(200).json({
      success: true,
      dashboard: {
        user,
        helpRequests: {
          totalRequests,
          fulfilledRequests,
          pendingRequests,
          recentRequests,
        },
        responses: { totalResponses, acceptedResponses, recentAccepted },
        transactions,
        trends,
      },
    });
  } catch (error) {
    console.error("getDashboard error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/delete-account", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isDeleted) {
      return res.status(400).json({ message: "Account already deleted" });
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: "Account deactivated successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put("/restore-account", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.isDeleted) {
      return res.status(400).json({ message: "No deleted account to restore" });
    }

    user.isDeleted = false;
    user.deletedAt = null;
    await user.save();

    res
      .status(200)
      .json({ success: true, message: "Account restored successfully" });
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

    // Save single transaction
    await Transaction.create({
      request: request._id,
      from: creator._id,
      to: responder._id,
      amount,
      type: "debit",
      description: `Kyn transfer for fulfilling request "${request.title}"`,
    });

    // Transfer Kyn
    responder.kynBalance += amount;
    await responder.save();

    // Mark as fulfilled and reset locked reward
    request.fulfilled = true;
    request.rewardLocked = 0;
    await request.save();

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

// GET /users/:id -> View another user's profile
router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "fullname lastName bio KynPoints",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Server error" });
  }
});

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = router;
