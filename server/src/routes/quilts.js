const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const { fn, col } = require("sequelize");

const router = express.Router();

const MAX_QUILT_NAME_LENGTH = 100;

router.get("/", authMiddleware, async (req, res) => {
  const { Quilt, Patch } = getModels();

  try {
    const quilts = await Quilt.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Patch,
          as: "patches",
          attributes: [],
        },
      ],
      attributes: {
        include: [[fn("COUNT", col("patches.id")), "patchCount"]],
      },
      group: ["Quilt.id"],
    });

    return res.json({ quilts });
  } catch (err) {
    console.error("Quilt fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch quilts." });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const { Quilt } = getModels();
  const { name, description } = req.body || {};

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "Quilt name is required." });
  }

  const trimmedName = name.trim();
  if (trimmedName.length > MAX_QUILT_NAME_LENGTH) {
    return res.status(400).json({
      message: `Quilt name cannot exceed ${MAX_QUILT_NAME_LENGTH} characters.`,
    });
  }

  try {
    const quilt = await Quilt.create({
      userId: req.user.id,
      name: trimmedName,
      description: typeof description === "string" ? description.trim() : "",
    });

    return res.status(201).json({ quilt });
  } catch (err) {
    console.error("Quilt creation failed:", err);
    return res.status(500).json({ message: "Failed to create quilt." });
  }
});

router.get("/:quiltId", authMiddleware, async (req, res) => {
  const { Quilt, Patch, Post, User } = getModels();
  const { quiltId } = req.params;

  try {
    const quilt = await Quilt.findByPk(quiltId, {
      include: [
        {
          model: Patch,
          as: "patches",
          include: [
            {
              model: Post,
              as: "post",
              include: [
                {
                  model: User,
                  as: "author",
                  attributes: ["id", "username", "name", "profilePicture"],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!quilt) {
      return res.status(404).json({ message: "Quilt not found." });
    }

    if (quilt.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden." });
    }

    return res.json({ quilt });
  } catch (err) {
    console.error("Quilt detail fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch quilt." });
  }
});

router.delete("/:quiltId", authMiddleware, async (req, res) => {
  const { Quilt } = getModels();
  const { quiltId } = req.params;

  try {
    const quilt = await Quilt.findByPk(quiltId);
    if (!quilt) {
      return res.status(404).json({ message: "Quilt not found." });
    }

    if (quilt.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden." });
    }

    await quilt.destroy();
    return res.json({ message: "Quilt deleted." });
  } catch (err) {
    console.error("Quilt delete failed:", err);
    return res.status(500).json({ message: "Failed to delete quilt." });
  }
});

router.post("/:quiltId/patches", authMiddleware, async (req, res) => {
  const { Quilt, Patch, Post } = getModels();
  const { quiltId } = req.params;
  const { postId } = req.body || {};

  if (!postId) {
    return res.status(400).json({ message: "postId is required." });
  }

  try {
    const quilt = await Quilt.findByPk(quiltId);
    if (!quilt) {
      return res.status(404).json({ message: "Quilt not found." });
    }

    if (quilt.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    const [patch] = await Patch.findOrCreate({
      where: { quiltId, postId },
      defaults: { quiltId, postId, userId: req.user.id },
    });

    return res.status(201).json({ patch });
  } catch (err) {
    console.error("Patch creation failed:", err);
    return res.status(500).json({ message: "Failed to add post to quilt." });
  }
});

router.delete("/:quiltId/patches/:postId", authMiddleware, async (req, res) => {
  const { Quilt, Patch } = getModels();
  const { quiltId, postId } = req.params;

  try {
    const quilt = await Quilt.findByPk(quiltId);
    if (!quilt) {
      return res.status(404).json({ message: "Quilt not found." });
    }

    if (quilt.userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden." });
    }

    await Patch.destroy({ where: { quiltId, postId } });
    return res.json({ message: "Post removed from quilt." });
  } catch (err) {
    console.error("Patch removal failed:", err);
    return res.status(500).json({ message: "Failed to remove post from quilt." });
  }
});

module.exports = router;
