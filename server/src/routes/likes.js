const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");

const router = express.Router({ mergeParams: true });

router.post("/:postId/like", authMiddleware, async (req, res) => {
  const { Like, Post } = getModels();
  const { postId } = req.params;

  try {
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    await Like.findOrCreate({
      where: { userId: req.user.id, postId },
      defaults: { userId: req.user.id, postId },
    });

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

    await Like.destroy({ where: { userId: req.user.id, postId } });

    const likeCount = await Like.count({ where: { postId } });
    return res.json({ liked: false, likeCount });
  } catch (err) {
    console.error("Unlike failed:", err);
    return res.status(500).json({ message: "Failed to unlike post." });
  }
});

module.exports = router;
