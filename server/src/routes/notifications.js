const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.get("/", authMiddleware, async (req, res) => {
  const { Notification, User, Post } = getModels();

  try {
    const notifications = await Notification.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit: 50,
      include: [
        {
          model: User,
          as: "actor",
          attributes: ["id", "username", "name", "profilePicture"],
        },
        {
          model: Post,
          as: "post",
          attributes: ["id", "imageUrl"],
        },
      ],
    });

    const unreadCount = await Notification.count({
      where: { userId: req.user.id, read: false },
    });

    return res.json({ notifications, unreadCount });
  } catch (err) {
    console.error("Notification fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch notifications." });
  }
});

router.post("/read", authMiddleware, async (req, res) => {
  const { Notification } = getModels();

  try {
    await Notification.update(
      { read: true },
      { where: { userId: req.user.id, read: false } }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Mark notifications read failed:", err);
    return res.status(500).json({ message: "Failed to mark notifications as read." });
  }
});

module.exports = router;
