const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");

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
  const { Post } = getModels();
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

router.post("/", authMiddleware, async (req, res) => {
  const { Post } = getModels();
  const { caption, imageUrl, type, priceCents, isPublic } = req.body || {};

  const normalizedType = normalizeType(type);
  if (!normalizedType) {
    return res.status(400).json({ message: "Type must be either 'regular' or 'market'." });
  }

  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    return res.status(400).json({ message: "imageUrl is required." });
  }

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

  try {
    const post = await Post.create({
      userId: req.user.id,
      type: normalizedType,
      caption: cleanedCaption,
      imageUrl: imageUrl.trim(),
      priceCents: normalizedPrice,
      isPublic: normalizedIsPublic,
    });

    return res.status(201).json({ post });
  } catch (err) {
    console.error("Post creation failed:", err);
    return res.status(500).json({ message: "Failed to create post." });
  }
});

module.exports = router;
