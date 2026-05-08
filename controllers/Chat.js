const { isAuthenticated } = require("../middlewares/user/auth");
const Chat = require("../models/user/Chat");
const HelpRequest = require("../models/user/HelpRequests");
const express = require("express");
const router = express.Router();

// GET /chats - Get all chats for logged-in user
router.get("/all", isAuthenticated, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .populate("participants", "firstName")
      .populate("messages.sender", "firstName")
      .sort({ updatedAt: -1 });

    if (!chats.length) {
      return res.status(200).json({ success: true, chats: [] });
    }

    // Format response: latest message preview
    const formatted = chats.map(chat => {
      const latestMessage = chat.messages[chat.messages.length - 1];
      return {
        chatId: chat._id,
        participants: chat.participants,
        latestMessage: latestMessage
          ? {
              text: latestMessage.text,
              sender: latestMessage.sender.firstName,
              createdAt: latestMessage.createdAt,
            }
          : null,
        updatedAt: chat.updatedAt,
      };
    });

    res.status(200).json({ success: true, chats: formatted });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});
// GET /chats/unread
router.get("/unread", isAuthenticated, async (req, res) => {
  try {
    // Find all chats with current user
    const chats = await Chat.find({ participants: req.user._id })
      .populate("participants", "firstName");

    // Build response with unread counts
    const unreadCounts = chats.map((chat) => {
      const count = chat.messages.filter(
        (msg) => msg.sender.toString() !== req.user._id.toString() && !msg.read
      ).length;

      return {
        chatId: chat._id,
        participants: chat.participants,
        unreadCount: count,
      };
    });

    res.status(200).json({ success: true, unreadCounts });
  } catch (error) {
    console.error("Error fetching unread counts:", error);
    res.status(500).json({ message: error.message });
  }
});

// Delete a single message just for me
router.delete("/:chatId/message/:messageId/me", isAuthenticated, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const message = chat.messages.id(req.params.messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });

    // If not already marked deleted for this user, push it
    if (!message.deletedFor.includes(req.user._id)) {
      message.deletedFor.push(req.user._id);
      await chat.save();
    }

    res.json({ success: true, message: "Message deleted for you" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/:chatId/read", isAuthenticated, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);

    if (!chat) return res.status(404).json({ message: "Chat not found" });

    // Only participants can mark messages as read
    if (!chat.participants.includes(req.user._id)) {
      return res.status(403).json({ message: "You are not a participant in this chat" });
    }

    // Mark all messages from the *other user* as read
    chat.messages.forEach((msg) => {
      if (msg.sender.toString() !== req.user._id.toString()) {
        msg.read = true;
      }
    });

    await chat.save();

    res.status(200).json({ success: true, message: "Messages marked as read" });
  } catch (error) {
    console.error("Error marking as read:", error);
    res.status(500).json({ message: error.message });
  }
});

router.post("/start/:requestId", isAuthenticated, async (req, res) => {
  try {
    const request = await HelpRequest.findById(req.params.requestId);

    if (!request || !request.respondedBy) {
      return res.status(400).json({ message: "Request not found or no responder accepted" });
    }

    // Participants are creator and accepted responder
    const participants = [request.createdBy, request.respondedBy];

    // Check if chat already exists
    let chat = await Chat.findOne({ requestId: request._id });
    if (!chat) {
      chat = await Chat.create({ requestId: request._id, participants, messages: [] });
    }

    res.status(201).json({ success: true, chat });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/:chatId/message", isAuthenticated, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Message text is required" });

    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    // Only participants can send messages
    if (!chat.participants.includes(req.user._id)) {
      return res.status(403).json({ message: "You are not a participant in this chat" });
    }

    chat.messages.push({ sender: req.user._id, text });
    await chat.save();

    res.status(201).json({ success: true, chat });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/:chatId", isAuthenticated, async (req, res) => {
  try {
    const { chatId } = req.params;

    // Fetch chat, populate participants and messages (sorted by createdAt)
    const chat = await Chat.findById(chatId)
      .populate("participants", "firstName")
      .populate("messages.sender", "firstName")
      .lean();

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Ensure user is a participant
    const userId = req.user._id.toString();
    const isParticipant = chat.participants.some(
      (p) => p._id.toString() === userId
    );

    if (!isParticipant) {
      return res.status(403).json({ message: "Access denied: Not a participant" });
    }

    // Sort messages by createdAt descending (newest first)
    chat.messages = chat.messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({ success: true, chat });
  } catch (error) {
    console.error("Error fetching chat:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});



module.exports = router;