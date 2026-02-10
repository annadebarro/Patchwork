const express = require("express");
const { getModels } = require("../models");

const router = express.Router();

router.get("/:username", async (req, res) => {
  const { User, Post } = getModels();
  const { username } = req.params;

  try {
    const user = await User.findOne({
      where: { username: username.toLowerCase() },
      attributes: ["id", "username", "name", "bio", "profilePicture", "createdAt"],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const posts = await Post.findAll({
      where: { userId: user.id, isPublic: true },
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "username", "name", "profilePicture"],
        },
      ],
    });

    return res.json({
      user: user.toJSON(),
      posts,
    });
  } catch (err) {
    console.error("User profile fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch user profile." });
  }
});

module.exports = router;
