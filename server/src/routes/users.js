const express = require("express");
const { getModels } = require("../models");
const { optionalAuthMiddleware } = require("../middleware/auth");

const router = express.Router();

router.get("/:username", optionalAuthMiddleware, async (req, res) => {
  const { User, Post, Follow } = getModels();
  const { username } = req.params;

  try {
    const user = await User.findOne({
      where: { username: username.toLowerCase() },
      attributes: ["id", "username", "name", "bio", "profilePicture", "createdAt"],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const [posts, followerCount, followingCount] = await Promise.all([
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
    ]);

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
      isFollowing,
    });
  } catch (err) {
    console.error("User profile fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch user profile." });
  }
});

module.exports = router;
