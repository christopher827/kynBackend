const { isAuthenticated } = require("../middlewares/user/auth");
const Transaction = require("../models/user/KynHistory");
const KynPurchase = require("../models/user/KynPurchase");
const User = require("../models/user/User");
const crypto = require("crypto");
const express = require("express");
const router = express.Router();

router.get("/Kyn/history", isAuthenticated, async (req, res) => {
  try {
    const history = await KynPurchase.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, count: history.length, history });
  } catch (err) {
    console.error("History error:", err);
    res.status(500).json({ success: false });
  }
});

router.post("/Kyn/webhook", isAuthenticated, async (req, res) => {
  try {
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    // if (hash !== req.headers["x-paystack-signature"])
    //   return res.status(401).json({ message: "Invalid signature" });

    const event = req.body.event;
    const data = req.body.data;

    const purchase = await KynPurchase.findOne({ reference: data.reference });
    if (!purchase)
      return res.status(404).json({ message: "Purchase not found" });
    if (purchase.status === "success")
      return res.status(200).json({ message: "Already processed" });

    purchase.status = data.status === "success" ? "success" : "failed";
    purchase.gatewayTransactionId = data.id;
    purchase.rawData = data;
    await purchase.save();

    if (purchase.status === "success") {
      const user = await User.findById(purchase.user);
      user.kynBalance += purchase.KynReceived;
      await user.save();
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ success: false });
  }
});

router.post("/Kyn/purchase", isAuthenticated, async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user._id;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount" });
    }

    const conversionRate = 100; // $1 → 100 Kyn
    const KynToCredit = amount * conversionRate;

    // Generate unique reference
    const reference =
      "Kyn_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);

    // Save initial payment record
    const payment = await KynPurchase.create({
      user: userId,
      amountPaid: amount,
      currency: "NGN",
      KynReceived: KynToCredit,
      paymentMethod: "paystack",
      reference,
      status: "pending",
    });

    // Initialize Paystack payment
    // const response = await axios.post(
    //   "https://api.paystack.co/transaction/initialize",
    //   {
    //     email: req.user.email,
    //     amount: amount * 100, // Paystack needs kobo
    //     reference,
    //   },
    //   {
    //     headers: {
    //       Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    //     },
    //   }
    // );

    return res.json({
      success: true,
      // authorizationUrl: response.data.data.authorization_url,
      reference,
      // newBalance:userId.KynBalance + KynToCredit,
      // paymentId: payment._id,
    });
  } catch (error) {
    console.error("Init payment error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
