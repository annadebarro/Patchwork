const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");

const router = express.Router({ mergeParams: true });

const MAX_COMMENT_LENGTH = 1000;

router.get("/:postId/comments", async (req, res) => {
  const { Comment, User, Post } = getModels();
  const { postId } = req.params;

  try {
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    const comments = await Comment.findAll({
      where: { postId },
      order: [["createdAt", "ASC"]],
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "username", "name", "profilePicture"],
        },
      ],
    });

    return res.json({ comments });
  } catch (err) {
    console.error("Comment fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch comments." });
  }
});

router.post("/:postId/comments", authMiddleware, async (req, res) => {
  const { Comment, User, Post } = getModels();
  const { postId } = req.params;
  const { body } = req.body || {};

  if (typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ message: "Comment body is required." });
  }

  const trimmedBody = body.trim();
  if (trimmedBody.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({
      message: `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters.`,
    });
  }

  try {
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    const comment = await Comment.create({
      userId: req.user.id,
      postId,
      body: trimmedBody,
    });

    const commentWithAuthor = await Comment.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "username", "name", "profilePicture"],
        },
      ],
    });

    return res.status(201).json({ comment: commentWithAuthor });
  } catch (err) {
    console.error("Comment creation failed:", err);
    return res.status(500).json({ message: "Failed to create comment." });
  }
});

module.exports = router;
