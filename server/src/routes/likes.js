const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const { logUserActionSafe } = require("../services/actionLogger");

const router = express.Router({ mergeParams: true });

router.post("/:postId/like", authMiddleware, async (req, res) => {
  const { Like, Post, Notification } = getModels();
  const { postId } = req.params;

  try {
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    const [, created] = await Like.findOrCreate({
      where: { userId: req.user.id, postId },
      defaults: { userId: req.user.id, postId },
    });

    if (created) {
      await logUserActionSafe({
        req,
        userId: req.user.id,
        actionType: "post_like",
        targetType: "post",
        targetId: postId,
        metadata: {
          route: "/api/posts/:postId/like",
          method: req.method,
          postOwnerId: post.userId,
        },
      });

      if (post.userId !== req.user.id) {
        await Notification.create({
          userId: post.userId,
          actorId: req.user.id,
          type: "like",
          postId,
        });
      }
    }

    const likeCount = await Like.count({ where: { postId } });
    return res.json({ liked: true, likeCount });
  } catch (err) {
    console.error("Like failed:", err);
    return res.status(500).json({ message: "Failed to like post." });
  }
});

router.delete("/:postId/like", authMiddleware, async (req, res) => {
  const { Like, Post } = getModels();
  const { postId } = req.params;

  try {
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    const destroyedCount = await Like.destroy({ where: { userId: req.user.id, postId } });

    if (destroyedCount > 0) {
      await logUserActionSafe({
        req,
        userId: req.user.id,
        actionType: "post_unlike",
        targetType: "post",
        targetId: postId,
        metadata: {
          route: "/api/posts/:postId/like",
          method: req.method,
          postOwnerId: post.userId,
        },
      });
    }

    const likeCount = await Like.count({ where: { postId } });
    return res.json({ liked: false, likeCount });
  } catch (err) {
    console.error("Unlike failed:", err);
    return res.status(500).json({ message: "Failed to unlike post." });
  }
});

module.exports = router;
