const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const { Op } = require("sequelize");

const router = express.Router();

// GET /conversations — list user's conversations
router.get("/conversations", authMiddleware, async (req, res) => {
  const { Conversation, ConversationParticipant, Message, User } = getModels();

  try {
    // Find all conversation IDs the user participates in
    const participantRows = await ConversationParticipant.findAll({
      where: { userId: req.user.id },
      attributes: ["conversationId"],
    });

    const conversationIds = participantRows.map((p) => p.conversationId);
    if (!conversationIds.length) {
      return res.json({ conversations: [] });
    }

    const conversations = await Conversation.findAll({
      where: { id: conversationIds },
      include: [
        {
          model: ConversationParticipant,
          as: "participants",
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "username", "name", "profilePicture"],
            },
          ],
        },
        {
          model: Message,
          as: "messages",
          limit: 1,
          order: [["createdAt", "DESC"]],
          include: [
            {
              model: User,
              as: "sender",
              attributes: ["id", "username", "name"],
            },
          ],
        },
      ],
      order: [["updatedAt", "DESC"]],
    });

    return res.json({ conversations });
  } catch (err) {
    console.error("Conversation list failed:", err);
    return res.status(500).json({ message: "Failed to fetch conversations." });
  }
});

// POST /conversations — create or find a conversation
router.post("/conversations", authMiddleware, async (req, res) => {
  const { Conversation, ConversationParticipant, User } = getModels();
  const { participantIds } = req.body || {};

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return res.status(400).json({ message: "participantIds array is required." });
  }

  // Ensure current user is included
  const allIds = [...new Set([req.user.id, ...participantIds])];

  if (allIds.length < 2) {
    return res.status(400).json({ message: "A conversation needs at least two participants." });
  }

  try {
    // For 1:1 conversations, check if one already exists
    if (allIds.length === 2) {
      const existingParticipations = await ConversationParticipant.findAll({
        where: { userId: allIds },
        attributes: ["conversationId", "userId"],
      });

      // Group by conversationId
      const convMap = {};
      for (const p of existingParticipations) {
        if (!convMap[p.conversationId]) convMap[p.conversationId] = new Set();
        convMap[p.conversationId].add(p.userId);
      }

      // Find a conversation with exactly these 2 participants
      for (const [convId, members] of Object.entries(convMap)) {
        if (members.size === 2 && allIds.every((id) => members.has(id))) {
          // Verify no extra participants
          const totalCount = await ConversationParticipant.count({
            where: { conversationId: convId },
          });
          if (totalCount === 2) {
            const existing = await Conversation.findByPk(convId, {
              include: [
                {
                  model: ConversationParticipant,
                  as: "participants",
                  include: [
                    {
                      model: User,
                      as: "user",
                      attributes: ["id", "username", "name", "profilePicture"],
                    },
                  ],
                },
              ],
            });
            return res.json({ conversation: existing, existing: true });
          }
        }
      }
    }

    // Create new conversation
    const conversation = await Conversation.create();
    await ConversationParticipant.bulkCreate(
      allIds.map((userId) => ({ conversationId: conversation.id, userId }))
    );

    const fullConversation = await Conversation.findByPk(conversation.id, {
      include: [
        {
          model: ConversationParticipant,
          as: "participants",
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "username", "name", "profilePicture"],
            },
          ],
        },
      ],
    });

    // Emit to all participants
    const io = req.app.get("io");
    if (io) {
      for (const id of allIds) {
        if (id !== req.user.id) {
          io.to(id).emit("conversation_updated", { conversation: fullConversation });
        }
      }
    }

    return res.status(201).json({ conversation: fullConversation, existing: false });
  } catch (err) {
    console.error("Conversation create failed:", err);
    return res.status(500).json({ message: "Failed to create conversation." });
  }
});

// GET /conversations/:id — get conversation detail with messages
router.get("/conversations/:id", authMiddleware, async (req, res) => {
  const { Conversation, ConversationParticipant, Message, User } = getModels();
  const { id } = req.params;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  try {
    // Verify user is a participant
    const participation = await ConversationParticipant.findOne({
      where: { conversationId: id, userId: req.user.id },
    });
    if (!participation) {
      return res.status(403).json({ message: "You are not in this conversation." });
    }

    const conversation = await Conversation.findByPk(id, {
      include: [
        {
          model: ConversationParticipant,
          as: "participants",
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "username", "name", "profilePicture"],
            },
          ],
        },
      ],
    });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const messages = await Message.findAll({
      where: { conversationId: id },
      order: [["createdAt", "ASC"]],
      limit,
      offset,
      include: [
        {
          model: User,
          as: "sender",
          attributes: ["id", "username", "name", "profilePicture"],
        },
      ],
    });

    const totalMessages = await Message.count({ where: { conversationId: id } });

    return res.json({ conversation, messages, totalMessages });
  } catch (err) {
    console.error("Conversation detail failed:", err);
    return res.status(500).json({ message: "Failed to fetch conversation." });
  }
});

// DELETE /conversations/:id — leave a conversation
router.delete("/conversations/:id", authMiddleware, async (req, res) => {
  const { Conversation, ConversationParticipant, Message } = getModels();
  const { id } = req.params;

  try {
    const participation = await ConversationParticipant.findOne({
      where: { conversationId: id, userId: req.user.id },
    });
    if (!participation) {
      return res.status(403).json({ message: "You are not in this conversation." });
    }

    await participation.destroy();

    // If no participants left, delete conversation and its messages
    const remaining = await ConversationParticipant.count({ where: { conversationId: id } });
    if (remaining === 0) {
      await Message.destroy({ where: { conversationId: id } });
      await Conversation.destroy({ where: { id } });
    }

    return res.json({ message: "Left conversation." });
  } catch (err) {
    console.error("Conversation leave failed:", err);
    return res.status(500).json({ message: "Failed to leave conversation." });
  }
});

// POST /conversations/:id/messages — send a message
router.post("/conversations/:id/messages", authMiddleware, async (req, res) => {
  const { Conversation, ConversationParticipant, Message, User, Notification } = getModels();
  const { id } = req.params;
  const { body } = req.body || {};

  if (!body || typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ message: "Message body is required." });
  }

  try {
    // Verify user is a participant
    const participation = await ConversationParticipant.findOne({
      where: { conversationId: id, userId: req.user.id },
    });
    if (!participation) {
      return res.status(403).json({ message: "You are not in this conversation." });
    }

    const message = await Message.create({
      conversationId: id,
      senderId: req.user.id,
      body: body.trim(),
    });

    // Update conversation's updatedAt
    await Conversation.update({ updatedAt: new Date() }, { where: { id } });

    const fullMessage = await Message.findByPk(message.id, {
      include: [
        {
          model: User,
          as: "sender",
          attributes: ["id", "username", "name", "profilePicture"],
        },
      ],
    });

    // Get all participants except sender
    const participants = await ConversationParticipant.findAll({
      where: { conversationId: id, userId: { [Op.ne]: req.user.id } },
    });

    // Emit via Socket.IO and create notifications
    const io = req.app.get("io");
    for (const p of participants) {
      if (io) {
        io.to(p.userId).emit("new_message", {
          message: fullMessage,
          conversationId: id,
        });
      }

      await Notification.create({
        userId: p.userId,
        actorId: req.user.id,
        type: "message",
        postId: null,
      });
    }

    return res.status(201).json({ message: fullMessage });
  } catch (err) {
    console.error("Send message failed:", err);
    return res.status(500).json({ message: "Failed to send message." });
  }
});

module.exports = router;
