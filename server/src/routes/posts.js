const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const { optionalAuthMiddleware } = require("../middleware/auth");
const {
  getPostMetadataFromPost,
  getPostMetadataOptions,
  hasPostMetadataFields,
  normalizeAndValidatePostMetadata,
} = require("../services/postMetadata");

const router = express.Router();

const MAX_CAPTION_LENGTH = 2000;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function normalizeType(rawType) {
  if (!rawType) return "regular";
  const value = String(rawType).toLowerCase();
  if (value === "regular" || value === "market") return value;
  return null;
}

function parsePriceCents(rawPrice) {
  if (rawPrice === undefined || rawPrice === null || rawPrice === "") return null;
  const parsed = Number(rawPrice);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded >= 0 ? rounded : null;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

router.get("/", async (req, res) => {
  const { Post, User } = getModels();
  const rawType = req.query.type;
  const type = rawType ? normalizeType(rawType) : null;
  const userId = req.query.userId ? String(req.query.userId) : null;

  if (rawType && !type) {
    return res.status(400).json({ message: "Type must be either 'regular' or 'market'." });
  }

  const limit = clamp(toInt(req.query.limit, DEFAULT_LIMIT), 1, MAX_LIMIT);
  const offset = clamp(toInt(req.query.offset, 0), 0, 1000);

  try {
    const where = { isPublic: true };
    if (type) where.type = type;
    if (userId) where.userId = userId;

    const posts = await Post.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "username", "name", "profilePicture"],
        },
      ],
    });

    return res.json({ posts });
  } catch (err) {
    console.error("Post fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch posts." });
  }
});

router.get("/mine", authMiddleware, async (req, res) => {
  const { Post } = getModels();
  const limit = clamp(toInt(req.query.limit, DEFAULT_LIMIT), 1, MAX_LIMIT);
  const offset = clamp(toInt(req.query.offset, 0), 0, 1000);

  try {
    const posts = await Post.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.json({ posts });
  } catch (err) {
    console.error("User post fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch user posts." });
  }
});

router.get("/metadata/options", (_req, res) => {
  return res.json(getPostMetadataOptions());
});

const MAX_IMAGES = 10;

function normalizeImageUrls(body) {
  if (Array.isArray(body.imageUrls)) {
    const urls = body.imageUrls.filter((u) => typeof u === "string" && u.trim());
    return urls.length > 0 ? urls.map((u) => u.trim()) : null;
  }
  if (typeof body.imageUrl === "string" && body.imageUrl.trim()) {
    return [body.imageUrl.trim()];
  }
  return null;
}

router.post("/", authMiddleware, async (req, res) => {
  const { Post } = getModels();
  const { caption, type, priceCents, isPublic } = req.body || {};

  const normalizedType = normalizeType(type);
  if (!normalizedType) {
    return res.status(400).json({ message: "Type must be either 'regular' or 'market'." });
  }

  const imageUrls = normalizeImageUrls(req.body || {});
  if (!imageUrls) {
    return res.status(400).json({ message: "At least one image is required." });
  }
  if (imageUrls.length > MAX_IMAGES) {
    return res.status(400).json({ message: `A post can have at most ${MAX_IMAGES} images.` });
  }
  const imageUrl = imageUrls[0];

  if (caption !== undefined && typeof caption !== "string") {
    return res.status(400).json({ message: "Caption must be a string." });
  }

  const cleanedCaption = typeof caption === "string" ? caption.trim() : "";
  if (cleanedCaption.length > MAX_CAPTION_LENGTH) {
    return res.status(400).json({ message: `Caption cannot exceed ${MAX_CAPTION_LENGTH} characters.` });
  }

  const normalizedPrice = parsePriceCents(priceCents);
  if (normalizedType === "market" && normalizedPrice === null) {
    return res.status(400).json({ message: "priceCents is required for market posts." });
  }

  if (normalizedType === "regular" && priceCents !== undefined && normalizedPrice === null) {
    return res.status(400).json({ message: "priceCents must be a number when provided." });
  }

  const normalizedIsPublic =
    typeof isPublic === "boolean" ? isPublic : isPublic === undefined ? true : Boolean(isPublic);
  const normalizedMetadata = normalizeAndValidatePostMetadata(req.body || {}, { mode: "create" });
  if (normalizedMetadata.error) {
    return res.status(400).json({ message: normalizedMetadata.error });
  }

  try {
    const post = await Post.create({
      userId: req.user.id,
      type: normalizedType,
      caption: cleanedCaption,
      imageUrl,
      imageUrls,
      priceCents: normalizedPrice,
      isPublic: normalizedIsPublic,
      ...normalizedMetadata.value,
    });

    return res.status(201).json({ post });
  } catch (err) {
    console.error("Post creation failed:", err);
    return res.status(500).json({ message: "Failed to create post." });
  }
});

router.get("/:postId", optionalAuthMiddleware, async (req, res) => {
  const { Post, User, Like, Comment } = getModels();
  const { postId } = req.params;

  try {
    const post = await Post.findByPk(postId, {
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "username", "name", "profilePicture"],
        },
      ],
    });

    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    const likeCount = await Like.count({ where: { postId } });
    const commentCount = await Comment.count({ where: { postId } });

    let userLiked = false;
    if (req.user) {
      const existing = await Like.findOne({
        where: { userId: req.user.id, postId },
      });
      userLiked = Boolean(existing);
    }

    return res.json({
      post: {
        ...post.toJSON(),
        likeCount,
        commentCount,
        userLiked,
      },
    });
  } catch (err) {
    console.error("Post detail fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch post." });
  }
});

router.patch("/:postId", authMiddleware, async (req, res) => {
  const { Post } = getModels();
  const { postId } = req.params;
  const { caption, priceCents } = req.body || {};

  try {
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    if (post.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden." });
    }

    if (caption !== undefined) {
      if (typeof caption !== "string") {
        return res.status(400).json({ message: "Caption must be a string." });
      }
      const cleaned = caption.trim();
      if (cleaned.length > MAX_CAPTION_LENGTH) {
        return res.status(400).json({
          message: `Caption cannot exceed ${MAX_CAPTION_LENGTH} characters.`,
        });
      }
      post.caption = cleaned;
    }

    if (req.body.imageUrls !== undefined) {
      if (!Array.isArray(req.body.imageUrls)) {
        return res.status(400).json({ message: "imageUrls must be an array." });
      }
      const urls = req.body.imageUrls.filter((u) => typeof u === "string" && u.trim());
      if (urls.length === 0) {
        return res.status(400).json({ message: "A post must have at least one image." });
      }
      if (urls.length > MAX_IMAGES) {
        return res.status(400).json({ message: `A post can have at most ${MAX_IMAGES} images.` });
      }
      post.imageUrls = urls.map((u) => u.trim());
      post.imageUrl = post.imageUrls[0];
    }

    if (priceCents !== undefined) {
      const normalizedPrice = parsePriceCents(priceCents);
      if (normalizedPrice === null && priceCents !== null) {
        return res.status(400).json({ message: "priceCents must be a valid non-negative number." });
      }
      post.priceCents = normalizedPrice;
    }

    if (hasPostMetadataFields(req.body)) {
      const normalizedMetadata = normalizeAndValidatePostMetadata(req.body, {
        mode: "patch",
        current: getPostMetadataFromPost(post),
      });

      if (normalizedMetadata.error) {
        return res.status(400).json({ message: normalizedMetadata.error });
      }

      post.category = normalizedMetadata.value.category;
      post.subcategory = normalizedMetadata.value.subcategory;
      post.brand = normalizedMetadata.value.brand;
      post.styleTags = normalizedMetadata.value.styleTags;
      post.colorTags = normalizedMetadata.value.colorTags;
      post.condition = normalizedMetadata.value.condition;
      post.sizeLabel = normalizedMetadata.value.sizeLabel;
    }

    await post.save();
    return res.json({ post });
  } catch (err) {
    console.error("Post update failed:", err);
    return res.status(500).json({ message: "Failed to update post." });
  }
});

router.delete("/:postId", authMiddleware, async (req, res) => {
  const { Post, Like, Comment, Patch, Notification, CommentLike } = getModels();
  const { postId } = req.params;

  try {
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    if (post.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden." });
    }

    // Cascade deletes
    const comments = await Comment.findAll({ where: { postId }, attributes: ["id"] });
    const commentIds = comments.map((c) => c.id);
    if (commentIds.length) {
      await CommentLike.destroy({ where: { commentId: commentIds } });
    }
    await Comment.destroy({ where: { postId } });
    await Like.destroy({ where: { postId } });
    await Patch.destroy({ where: { postId } });
    await Notification.destroy({ where: { postId } });
    await post.destroy();

    return res.json({ message: "Post deleted." });
  } catch (err) {
    console.error("Post delete failed:", err);
    return res.status(500).json({ message: "Failed to delete post." });
  }
});

router.patch("/:postId/sold", authMiddleware, async (req, res) => {
  const { Post } = getModels();
  const { postId } = req.params;

  try {
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    if (post.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden." });
    }

    if (post.type !== "market") {
      return res.status(400).json({ message: "Only market posts can be marked as sold." });
    }

    post.isSold = !post.isSold;
    await post.save();

    return res.json({ post });
  } catch (err) {
    console.error("Post sold toggle failed:", err);
    return res.status(500).json({ message: "Failed to update sold status." });
  }
});

module.exports = router;
