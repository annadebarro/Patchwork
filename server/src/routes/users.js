const express = require("express");
const { Op } = require("sequelize");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const { optionalAuthMiddleware } = require("../middleware/auth");

const router = express.Router();

router.get("/search", authMiddleware, async (req, res) => {
  const { User } = getModels();
  const q = (req.query.q || "").trim();

  if (!q) {
    return res.json({ users: [] });
  }

  try {
    const users = await User.findAll({
      where: {
        [Op.or]: [
          { username: { [Op.iLike]: `%${q}%` } },
          { name: { [Op.iLike]: `%${q}%` } },
        ],
      },
      attributes: ["id", "username", "name", "profilePicture"],
      limit: 20,
    });

    return res.json({ users });
  } catch (err) {
    console.error("User search failed:", err);
    return res.status(500).json({ message: "Failed to search users." });
  }
});

router.get("/:username", optionalAuthMiddleware, async (req, res) => {
  const { User, Post, Follow, Quilt, Patch } = getModels();
  const { username } = req.params;

  try {
    const user = await User.findOne({
      where: { username: username.toLowerCase() },
      attributes: ["id", "username", "name", "bio", "profilePicture", "createdAt"],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const [posts, followerCount, followingCount, rawQuilts] = await Promise.all([
      Post.findAll({
        where: { userId: user.id, isPublic: true },
        order: [["createdAt", "DESC"]],
        include: [
          {
            model: User,
            as: "author",
            attributes: ["id", "username", "name", "profilePicture"],
          },
        ],
      }),
      Follow.count({ where: { followeeId: user.id } }),
      Follow.count({ where: { followerId: user.id } }),
      Quilt.findAll({
        where: { userId: user.id },
        order: [["createdAt", "DESC"]],
        include: [
          {
            model: Patch,
            as: "patches",
            include: [
              {
                model: Post,
                as: "post",
                attributes: ["id", "imageUrl"],
              },
            ],
          },
        ],
      }),
    ]);

    const quilts = rawQuilts.map((q) => ({
      id: q.id,
      name: q.name,
      description: q.description,
      isPublic: q.isPublic,
      createdAt: q.createdAt,
      patchCount: q.patches.length,
      previewImages: q.patches
        .slice(0, 9)
        .map((p) => p.post?.imageUrl)
        .filter(Boolean),
    }));

    let isFollowing = false;
    if (req.user) {
      const existingFollow = await Follow.findOne({
        where: { followerId: req.user.id, followeeId: user.id },
      });
      isFollowing = Boolean(existingFollow);
    }

    return res.json({
      user: { ...user.toJSON(), followerCount, followingCount },
      posts,
      quilts,
      isFollowing,
    });
  } catch (err) {
    console.error("User profile fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch user profile." });
  }
});

module.exports = router;
