const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// POST /ratings — submit a rating for a completed deal
router.post("/", authMiddleware, async (req, res) => {
  const { Rating, Conversation, ConversationParticipant } = getModels();
  const { conversationId, rateeId, score, review } = req.body || {};

  if (!conversationId || !rateeId || score === undefined) {
    return res.status(400).json({ message: "conversationId, rateeId, and score are required." });
  }

  const scoreNum = Number(score);
  if (!Number.isInteger(scoreNum) || scoreNum < 1 || scoreNum > 5) {
    return res.status(400).json({ message: "Score must be an integer between 1 and 5." });
  }

  try {
    // Verify caller is a participant
    const participation = await ConversationParticipant.findOne({
      where: { conversationId, userId: req.user.id },
    });
    if (!participation) {
      return res.status(403).json({ message: "You are not a participant in this conversation." });
    }

    // Verify deal is completed
    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }
    if (conversation.dealStatus !== "completed") {
      return res.status(400).json({ message: "Deal has not been marked as complete." });
    }

    // Verify ratee is the other participant (not self-rating)
    if (rateeId === req.user.id) {
      return res.status(400).json({ message: "You cannot rate yourself." });
    }
    const rateeParticipation = await ConversationParticipant.findOne({
      where: { conversationId, userId: rateeId },
    });
    if (!rateeParticipation) {
      return res.status(400).json({ message: "The ratee is not a participant in this conversation." });
    }

    // Upsert: find existing rating or create new one
    const { Notification } = getModels();

    const [rating, created] = await Rating.findOrCreate({
      where: { raterId: req.user.id, conversationId },
      defaults: { rateeId, score: scoreNum, review: review || null },
    });

    if (!created) {
      await rating.update({ score: scoreNum, review: review || null });
    }

    // Only notify on first submission (not re-submissions)
    if (created) {
      await Notification.create({
        userId: rateeId,
        actorId: req.user.id,
        type: "rating",
        postId: null,
      });
    }

    return res.status(created ? 201 : 200).json({ rating });
  } catch (err) {
    console.error("Submit rating failed:", err);
    return res.status(500).json({ message: "Failed to submit rating." });
  }
});

// PATCH /ratings/:id — edit your own rating
router.patch("/:id", authMiddleware, async (req, res) => {
  const { Rating } = getModels();
  const { id } = req.params;
  const { score, review } = req.body || {};

  const scoreNum = Number(score);
  if (!Number.isInteger(scoreNum) || scoreNum < 1 || scoreNum > 5) {
    return res.status(400).json({ message: "Score must be an integer between 1 and 5." });
  }

  try {
    const rating = await Rating.findByPk(id);
    if (!rating) return res.status(404).json({ message: "Rating not found." });
    if (rating.raterId !== req.user.id) {
      return res.status(403).json({ message: "You can only edit your own ratings." });
    }

    await rating.update({ score: scoreNum, review: review || null });
    return res.json({ rating });
  } catch (err) {
    console.error("Edit rating failed:", err);
    return res.status(500).json({ message: "Failed to edit rating." });
  }
});

// DELETE /ratings/:id — delete your own rating
router.delete("/:id", authMiddleware, async (req, res) => {
  const { Rating } = getModels();
  const { id } = req.params;

  try {
    const rating = await Rating.findByPk(id);
    if (!rating) return res.status(404).json({ message: "Rating not found." });
    if (rating.raterId !== req.user.id) {
      return res.status(403).json({ message: "You can only delete your own ratings." });
    }

    await rating.destroy();
    return res.json({ message: "Rating deleted." });
  } catch (err) {
    console.error("Delete rating failed:", err);
    return res.status(500).json({ message: "Failed to delete rating." });
  }
});

// GET /ratings/users/:userId — fetch ratings for a user (public)
router.get("/users/:userId", async (req, res) => {
  const { Rating, User } = getModels();
  const { userId } = req.params;

  try {
    const ratings = await Rating.findAll({
      where: { rateeId: userId },
      include: [
        {
          model: User,
          as: "rater",
          attributes: ["id", "username", "name", "profilePicture"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const totalCount = ratings.length;
    const averageScore =
      totalCount > 0
        ? ratings.reduce((sum, r) => sum + r.score, 0) / totalCount
        : null;

    return res.json({ ratings, averageScore, totalCount });
  } catch (err) {
    console.error("Fetch ratings failed:", err);
    return res.status(500).json({ message: "Failed to fetch ratings." });
  }
});

module.exports = router;
