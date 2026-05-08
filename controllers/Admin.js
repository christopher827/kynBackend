const { isAdmin } = require("../middlewares/admin/auth");
const User = require("../models/user/User");
const { sendToken } = require("../utils/JwtToken");
const Admin = require("../models/admin/Admin");
const bcrypt = require("bcryptjs");
const HelpRequest = require("../models/user/HelpRequests");
const Report = require("../models/user/Report");
const Transaction = require("../models/user/KynHistory");
const express = require("express");
const router = express.Router();

//create admin
router.post("/create-admin", async (req, res) => {
  const { email, password } = req.body;
  try {
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: "Admin already exists" });
    }
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const admin = await Admin.create({
      email,
      password: hash,
      admin: "admin",
    });
    res.status(201).json({ message: "Admin created successfully" });
  } catch (error) {
    console.error("createAdmin error:", error);
    res.status(500).json({ message: "Server error" });
  }
});
//login admin
router.post("/admin-login", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "All fields must be filled" });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: "Invalid credentials!" });
    }

    if (admin.isBlocked === true) {
      return res.status(400).json({ message: "Account currently blocked" });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.status(400).json({ message: "Invalid credentials!" });
    }

    sendToken(admin, 200, res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
//get all users
router.get("/all/users", isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, role, blocked, search } = req.query;

    const query = {};
    if (role) query.role = role;

    if (blocked !== undefined) query.isBlocked = blocked === "true";

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 }) // newest first
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select("-password") // hide sensitive info
      .lean();

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      totalUsers: total,
      users,
    });
  } catch (error) {
    console.error("getAllUsers error:", error);
    res.status(500).json({ message: "Server error" });
  }
});
//get a user by id
router.get("/users/:id", isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select("-password") // hide sensitive info
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("getUserById error:", error);
    res.status(500).json({ message: "Server error" });
  }
});
//get platform statistics
router.get("/getStatistics", isAdmin, async (req, res) => {
  try {
    // Users
    const totalUsers = await User.countDocuments({ isDeleted: false });
    const blockedUsers = await User.countDocuments({ isBlocked: true });

    // Kyn
    const totalKyn = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$Kyn" } } },
    ]);

    // Help requests
    const totalRequests = await HelpRequest.countDocuments();
    const fulfilledRequests = await HelpRequest.countDocuments({
      fulfilled: true,
    });
    const pendingRequests = totalRequests - fulfilledRequests;

    // Transactions
    const totalTransactions = await Transaction.countDocuments();
    const totalCredits = await Transaction.aggregate([
      { $match: { type: "credit" } },
      { $group: { _id: null, sum: { $sum: "$amount" } } },
    ]);
    const totalDebits = await Transaction.aggregate([
      { $match: { type: "debit" } },
      { $group: { _id: null, sum: { $sum: "$amount" } } },
    ]);

    // Reports / disputes
    const totalReports = await Report.countDocuments();
    const resolvedReports = await Report.countDocuments({ resolved: true });
    const unresolvedReports = totalReports - resolvedReports;

    res.status(200).json({
      success: true,
      statistics: {
        users: { totalUsers, blockedUsers },
        Kyn: { totalKyn: totalKyn[0]?.total || 0 },
        helpRequests: { totalRequests, fulfilledRequests, pendingRequests },
        transactions: {
          totalTransactions,
          totalCredits: totalCredits[0]?.sum || 0,
          totalDebits: totalDebits[0]?.sum || 0,
        },
        reports: { totalReports, resolvedReports, unresolvedReports },
      },
    });
  } catch (error) {
    console.error("getStatistics error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

//update a user by admin
router.put("/users/:id", isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body; // Expect the fields to update in the request body

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update the allowed fields
    const allowedFields = [
      "firstName",
      "lastName",
      "email",
      "role",
      "kynBalance",
    ];
    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        user[field] = updates[field];
      }
    });

    await user.save();

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/users/:id/soft-delete", isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isDeleted) {
      return res.status(400).json({ message: "User is already soft-deleted" });
    }

    user.isDeleted = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: "User soft-deleted successfully",
      user,
    });
  } catch (error) {
    console.error("Soft-delete error:", error);
    res.status(500).json({ message: "Server error" });
  }
});
router.put("/users/:id/restore", isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isDeleted) {
      return res.status(400).json({ message: "User is not soft-deleted" });
    }

    user.isDeleted = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: "User restored successfully",
      user,
    });
  } catch (error) {
    console.error("Restore user error:", error);
    res.status(500).json({ message: "Server error" });
  }
});
router.delete("/users/:id/delete", isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "User permanently deleted successfully",
      userId,
    });
  } catch (error) {
    console.error("Permanent delete error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/requests/stats", isAdmin, async (req, res) => {
  try {
    const totalRequests = await HelpRequest.countDocuments();
    const fulfilled = await HelpRequest.countDocuments({ fulfilled: true });
    const pending = await HelpRequest.countDocuments({ fulfilled: false });
    const responded = await HelpRequest.countDocuments({
      respondedBy: { $ne: null },
    });
    const noResponse = await HelpRequest.countDocuments({ respondedBy: null });

    res.status(200).json({
      success: true,
      stats: {
        totalRequests,
        fulfilled,
        pending,
        responded,
        noResponse,
      },
    });
  } catch (error) {
    console.error("Requests stats error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/all/requests", isAdmin, async (req, res) => {
  try {
    const { status, creator, responder, urgency, isVirtual, limit, page } =
      req.query;

    // Build query object dynamically
    const query = {};

    if (status === "fulfilled") query.fulfilled = true;
    if (status === "pending") query.fulfilled = false;
    if (creator) query.createdBy = creator;
    if (responder) query.respondedBy = responder;
    if (urgency) query.urgency = urgency;
    if (isVirtual !== undefined) query.isVirtual = isVirtual === "true";

    // Pagination
    const perPage = parseInt(limit) || 20;
    const currentPage = parseInt(page) || 1;

    const requests = await HelpRequest.find(query)
      .populate("createdBy", "firstName lastName email")
      .populate("respondedBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage);

    const total = await HelpRequest.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      page: currentPage,
      perPage,
      requests,
    });
  } catch (error) {
    console.error("Get all requests error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get a single help request by ID
router.get("/requests/:id", isAdmin, async (req, res) => {
  try {
    const requestId = req.params.id;

    const request = await HelpRequest.findById(requestId)
      .populate("createdBy", "firstName lastName email")
      .populate("respondedBy", "firstName lastName email");

    if (!request) {
      return res.status(404).json({ message: "Help request not found" });
    }

    res.status(200).json({
      success: true,
      request,
    });
  } catch (error) {
    console.error("Get single request error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/requests/:id/update", isAdmin, async (req, res) => {
  try {
    const requestId = req.params.id;
    const {
      title,
      description,
      urgency,
      KynReward,
      isVirtual,
      tags,
      location,
      fulfilled,
    } = req.body;

    const request = await HelpRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Help request not found" });
    }

    // Update only fields that are provided
    if (title !== undefined) request.title = title;
    if (description !== undefined) request.description = description;
    if (urgency !== undefined) request.urgency = urgency;
    if (KynReward !== undefined) request.KynReward = KynReward;
    if (isVirtual !== undefined) request.isVirtual = isVirtual;
    if (tags !== undefined) request.tags = tags;
    if (location !== undefined) request.location = location;
    if (fulfilled !== undefined) request.fulfilled = fulfilled;

    await request.save();

    res.status(200).json({
      success: true,
      message: "Help request updated successfully",
      request,
    });
  } catch (error) {
    console.error("Update request error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete a help request (soft by default, hard if query ?hard=true)
router.delete("/requests/:id/delete", isAdmin, async (req, res) => {
  try {
    const requestId = req.params.id;
    const hardDelete = req.query.hard === "true";

    const request = await HelpRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Help request not found" });
    }

    if (hardDelete) {
      // Permanent delete
      await HelpRequest.findByIdAndDelete(requestId);
      return res.status(200).json({
        success: true,
        message: "Help request permanently deleted",
        requestId,
      });
    }

    // Soft delete
    request.isDeleted = true;
    await request.save();

    res.status(200).json({
      success: true,
      message: "Help request soft-deleted successfully",
      requestId,
    });
  } catch (error) {
    console.error("Delete request error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/notifications/send", isAdmin, async (req, res) => {
  try {
    const { title, message, tags } = req.body;

    if (!title || !message) {
      return res
        .status(400)
        .json({ message: "Title and message are required" });
    }

    // Filter users by tags if provided, else all users
    let users;
    if (tags && tags.length > 0) {
      users = await User.find({
        tags: { $in: tags },
        isDeleted: { $ne: true },
      });
    } else {
      users = await User.find({ isDeleted: { $ne: true } });
    }

    if (users.length === 0) {
      return res
        .status(404)
        .json({ message: "No users found for this notification" });
    }

    // Create notifications for each user
    const notifications = await Notification.insertMany(
      users.map((user) => ({
        user: user._id,
        title,
        message,
        read: false,
        createdAt: new Date(),
      })),
    );

    // Optional: send email notifications here (SMTP/SendGrid etc.)

    res.status(200).json({
      success: true,
      message: `Notification sent to ${users.length} users`,
      notifications,
    });
  } catch (error) {
    console.error("Send notification error:", error);
    res.status(500).json({ message: "Server error" });
  }
});
// Get all disputes
router.get("/disputes", isAdmin, async (req, res) => {
  try {
    const { status, requester, responder, limit, page } = req.query;

    // Build query dynamically
    const query = {};
    if (status) query.status = status; // e.g., "open", "resolved"
    if (requester) query.requester = requester;
    if (responder) query.responder = responder;

    const perPage = parseInt(limit) || 20;
    const currentPage = parseInt(page) || 1;

    const disputes = await Dispute.find(query)
      .populate("request", "title KynReward fulfilled")
      .populate("requester", "firstName lastName email")
      .populate("responder", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage);

    const total = await Dispute.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      page: currentPage,
      perPage,
      disputes,
    });
  } catch (error) {
    console.error("Get all disputes error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /admin/disputes/:id
router.get("/disputes/:id", isAdmin, async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id)
      .populate("user", "firstName email")
      .populate("request", "title status");

    if (!dispute) return res.status(404).json({ message: "Dispute not found" });

    res.status(200).json({ success: true, dispute });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /admin/disputes/:id/resolve
router.put("/disputes/:id/resolve", isAdmin, async (req, res) => {
  try {
    const { resolution, status } = req.body;

    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ message: "Dispute not found" });

    dispute.status = status || "resolved"; // default: resolved
    dispute.resolution = resolution || "Resolved by admin";

    await dispute.save();

    res.status(200).json({ success: true, dispute });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /admin/reports
router.get("/reports", isAdmin, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("user", "firstName email")
      .populate("request", "title");

    res.status(200).json({ success: true, reports });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /admin/reports/:id
router.get("/reports/:id", isAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate("user", "firstName email")
      .populate("request", "title");

    if (!report) return res.status(404).json({ message: "Report not found" });

    res.status(200).json({ success: true, report });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /admin/transactions
router.get("/transactions", isAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate("userId", "firstName email")
      .populate("relatedRequest", "title")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /admin/transactions/:id
router.get("/transactions/:id", isAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate("userId", "firstName email")
      .populate("relatedRequest", "title");

    if (!transaction)
      return res.status(404).json({ message: "Transaction not found" });

    res.status(200).json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /admin/transactions/stats
router.get("/transactions/stats", isAdmin, async (req, res) => {
  try {
    const inflow = await Transaction.aggregate([
      { $match: { type: "credit" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const outflow = await Transaction.aggregate([
      { $match: { type: "debit" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.status(200).json({
      success: true,
      inflow: inflow[0]?.total || 0,
      outflow: outflow[0]?.total || 0,
      net: (inflow[0]?.total || 0) - (outflow[0]?.total || 0),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /admin/transactions/search
router.post("/transactions/search", isAdmin, async (req, res) => {
  try {
    const { userId, type, startDate, endDate } = req.body;
    const query = {};

    if (userId) query.userId = userId;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate("userId", "firstName email")
      .populate("relatedRequest", "title")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// GET /admin/notifications/:id
router.get("/notifications/:id", isAdmin, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.status(200).json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// GET /admin/notifications
router.get("/notifications", isAdmin, async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 }) // newest first
      .limit(50); // optional, keep it light for dashboard

    res
      .status(200)
      .json({ success: true, count: notifications.length, notifications });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/analytics/dashboard", isAdmin, async (req, res) => {
  try {
    // 1. Total Kyn Exchanged
    const totalKynExchanged = await Transaction.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // 2. Active Users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeUsers = await User.countDocuments({
      lastLogin: { $gte: thirtyDaysAgo }, // assuming you track lastLogin
    });

    // 3. Most Common Request Types (tags/categories)
    const commonRequestTypes = await HelpRequest.aggregate([
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }, // top 5
    ]);

    // 4. Kyn Inflation Control (credits vs debits)
    const KynStats = await Transaction.aggregate([
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]);

    const credits = KynStats.find((k) => k._id === "credit")?.total || 0;
    const debits = KynStats.find((k) => k._id === "debit")?.total || 0;

    res.status(200).json({
      success: true,
      dashboard: {
        totalKynExchanged: totalKynExchanged[0]?.total || 0,
        activeUsers,
        mostCommonRequestTypes: commonRequestTypes,
        KynInflation: {
          totalCredits: credits,
          totalDebits: debits,
          net: credits - debits,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
