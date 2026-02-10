const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const { optionalAuthMiddleware } = require("../middleware/auth");
const { Op } = require("sequelize");

const router = express.Router({ mergeParams: true });

const MAX_COMMENT_LENGTH = 1000;

router.get("/:postId/comments", optionalAuthMiddleware, async (req, res) => {
  const { Comment, User, Post, CommentLike } = getModels();
  const { postId } = req.params;

  try {
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    const comments = await Comment.findAll({
      where: { postId, parentId: null },
      order: [["createdAt", "ASC"]],
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "username", "name", "profilePicture"],
        },
        {
          model: Comment,
          as: "replies",
          order: [["createdAt", "ASC"]],
          include: [
            {
              model: User,
              as: "author",
              attributes: ["id", "username", "name", "profilePicture"],
            },
          ],
        },
      ],
    });

    // Collect all comment IDs (top-level + replies)
    const allCommentIds = [];
    for (const c of comments) {
      allCommentIds.push(c.id);
      if (c.replies) {
        for (const r of c.replies) {
          allCommentIds.push(r.id);
        }
      }
    }

    // Fetch like counts in bulk
    const likeCounts = await CommentLike.findAll({
      where: { commentId: { [Op.in]: allCommentIds } },
      attributes: [
        "commentId",
        [CommentLike.sequelize.fn("COUNT", CommentLike.sequelize.col("id")), "cnt"],
      ],
      group: ["commentId"],
      raw: true,
    });
    const likeCountMap = {};
    for (const row of likeCounts) {
      likeCountMap[row.commentId] = parseInt(row.cnt, 10);
    }

    // Fetch user's likes if authenticated
    const userLikedSet = new Set();
    if (req.user) {
      const userLikes = await CommentLike.findAll({
        where: { userId: req.user.id, commentId: { [Op.in]: allCommentIds } },
        attributes: ["commentId"],
        raw: true,
      });
      for (const ul of userLikes) {
        userLikedSet.add(ul.commentId);
      }
    }

    // Attach likeCount and userLiked to each comment/reply
    const commentsJson = comments.map((c) => {
      const cj = c.toJSON();
      cj.likeCount = likeCountMap[cj.id] || 0;
      cj.userLiked = userLikedSet.has(cj.id);
      if (cj.replies) {
        cj.replies = cj.replies.map((r) => ({
          ...r,
          likeCount: likeCountMap[r.id] || 0,
          userLiked: userLikedSet.has(r.id),
        }));
      }
      return cj;
    });

    return res.json({ comments: commentsJson });
  } catch (err) {
    console.error("Comment fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch comments." });
  }
});

router.post("/:postId/comments", authMiddleware, async (req, res) => {
  const { Comment, User, Post, Notification } = getModels();
  const { postId } = req.params;
  const { body, parentId } = req.body || {};

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

    // Validate parentId if provided
    if (parentId) {
      const parentComment = await Comment.findByPk(parentId);
      if (!parentComment || parentComment.postId !== postId) {
        return res.status(400).json({ message: "Invalid parent comment." });
      }
    }

    const comment = await Comment.create({
      userId: req.user.id,
      postId,
      body: trimmedBody,
      parentId: parentId || null,
    });

    // Notify post owner about the comment (if commenter is not the post owner)
    if (post.userId !== req.user.id) {
      await Notification.create({
        userId: post.userId,
        actorId: req.user.id,
        type: "comment",
        postId,
      });
    }

    // Parse @mentions and create notifications
    const mentionRegex = /@(\w+)/g;
    const mentions = new Set();
    let match;
    while ((match = mentionRegex.exec(trimmedBody)) !== null) {
      mentions.add(match[1]);
    }

    if (mentions.size > 0) {
      const mentionedUsers = await User.findAll({
        where: {
          username: { [Op.in]: [...mentions] },
        },
        attributes: ["id", "username"],
      });

      for (const mentionedUser of mentionedUsers) {
        // Don't notify yourself or the post owner (already notified above)
        if (
          mentionedUser.id !== req.user.id &&
          mentionedUser.id !== post.userId
        ) {
          await Notification.create({
            userId: mentionedUser.id,
            actorId: req.user.id,
            type: "mention",
            postId,
          });
        }
      }
    }

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

router.post("/:postId/comments/:commentId/like", authMiddleware, async (req, res) => {
  const { Comment, CommentLike, Notification } = getModels();
  const { postId, commentId } = req.params;

  try {
    const comment = await Comment.findByPk(commentId);
    if (!comment || comment.postId !== postId) {
      return res.status(404).json({ message: "Comment not found." });
    }

    const [, created] = await CommentLike.findOrCreate({
      where: { userId: req.user.id, commentId },
      defaults: { userId: req.user.id, commentId },
    });

    if (created && comment.userId !== req.user.id) {
      await Notification.create({
        userId: comment.userId,
        actorId: req.user.id,
        type: "comment_like",
        postId,
      });
    }

    const likeCount = await CommentLike.count({ where: { commentId } });
    return res.json({ liked: true, likeCount });
  } catch (err) {
    console.error("Comment like failed:", err);
    return res.status(500).json({ message: "Failed to like comment." });
  }
});

router.delete("/:postId/comments/:commentId/like", authMiddleware, async (req, res) => {
  const { Comment, CommentLike } = getModels();
  const { postId, commentId } = req.params;

  try {
    const comment = await Comment.findByPk(commentId);
    if (!comment || comment.postId !== postId) {
      return res.status(404).json({ message: "Comment not found." });
    }

    await CommentLike.destroy({ where: { userId: req.user.id, commentId } });

    const likeCount = await CommentLike.count({ where: { commentId } });
    return res.json({ liked: false, likeCount });
  } catch (err) {
    console.error("Comment unlike failed:", err);
    return res.status(500).json({ message: "Failed to unlike comment." });
  }
});

router.delete("/:postId/comments/:commentId", authMiddleware, async (req, res) => {
  const { Comment, Post } = getModels();
  const { postId, commentId } = req.params;

  try {
    const comment = await Comment.findByPk(commentId);
    if (!comment || comment.postId !== postId) {
      return res.status(404).json({ message: "Comment not found." });
    }

    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    // Allow deletion if user owns the comment or owns the post
    if (req.user.id !== comment.userId && req.user.id !== post.userId) {
      return res.status(403).json({ message: "Not authorized to delete this comment." });
    }

    // Delete replies first, then the comment
    await Comment.destroy({ where: { parentId: commentId } });
    await comment.destroy();

    return res.status(200).json({ message: "Comment deleted." });
  } catch (err) {
    console.error("Comment deletion failed:", err);
    return res.status(500).json({ message: "Failed to delete comment." });
  }
});

module.exports = router;
