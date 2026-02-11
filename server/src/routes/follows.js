const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const { optionalAuthMiddleware } = require("../middleware/auth");
const { logUserActionSafe } = require("../services/actionLogger");

const router = express.Router();

// GET /follows/:userId/followers — list of users who follow :userId
router.get("/:userId/followers", optionalAuthMiddleware, async (req, res) => {
  const { Follow, User } = getModels();
  const { userId } = req.params;

  try {
    const follows = await Follow.findAll({
      where: { followeeId: userId },
      include: [
        {
          model: User,
          as: "follower",
          attributes: ["id", "username", "name", "profilePicture"],
        },
      ],
    });

    const currentUserId = req.user?.id;
    let currentUserFollowingIds = new Set();
    if (currentUserId) {
      const myFollows = await Follow.findAll({
        where: { followerId: currentUserId },
        attributes: ["followeeId"],
      });
      currentUserFollowingIds = new Set(myFollows.map((f) => f.followeeId));
    }

    const users = follows.map((f) => ({
      id: f.follower.id,
      username: f.follower.username,
      name: f.follower.name,
      profilePicture: f.follower.profilePicture,
      isFollowing: currentUserFollowingIds.has(f.follower.id),
    }));

    return res.json({ users });
  } catch (err) {
    console.error("Get followers failed:", err);
    return res.status(500).json({ message: "Failed to get followers." });
  }
});

// GET /follows/:userId/following — list of users that :userId follows
router.get("/:userId/following", optionalAuthMiddleware, async (req, res) => {
  const { Follow, User } = getModels();
  const { userId } = req.params;

  try {
    const follows = await Follow.findAll({
      where: { followerId: userId },
      include: [
        {
          model: User,
          as: "followee",
          attributes: ["id", "username", "name", "profilePicture"],
        },
      ],
    });

    const currentUserId = req.user?.id;
    let currentUserFollowingIds = new Set();
    if (currentUserId) {
      const myFollows = await Follow.findAll({
        where: { followerId: currentUserId },
        attributes: ["followeeId"],
      });
      currentUserFollowingIds = new Set(myFollows.map((f) => f.followeeId));
    }

    const users = follows.map((f) => ({
      id: f.followee.id,
      username: f.followee.username,
      name: f.followee.name,
      profilePicture: f.followee.profilePicture,
      isFollowing: currentUserFollowingIds.has(f.followee.id),
    }));

    return res.json({ users });
  } catch (err) {
    console.error("Get following failed:", err);
    return res.status(500).json({ message: "Failed to get following." });
  }
});

router.post("/:userId", authMiddleware, async (req, res) => {
  const { Follow, User, Notification } = getModels();
  const { userId } = req.params;

  if (userId === req.user.id) {
    return res.status(400).json({ message: "You cannot follow yourself." });
  }

  try {
    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    const [, created] = await Follow.findOrCreate({
      where: { followerId: req.user.id, followeeId: userId },
      defaults: { followerId: req.user.id, followeeId: userId },
    });

    if (created) {
      await logUserActionSafe({
        req,
        userId: req.user.id,
        actionType: "user_follow",
        targetType: "user",
        targetId: userId,
        metadata: {
          route: "/api/follows/:userId",
          method: req.method,
          followeeId: userId,
        },
      });

      await Notification.create({
        userId,
        actorId: req.user.id,
        type: "follow",
      });
    }

    const followerCount = await Follow.count({ where: { followeeId: userId } });
    return res.json({ following: true, followerCount });
  } catch (err) {
    console.error("Follow failed:", err);
    return res.status(500).json({ message: "Failed to follow user." });
  }
});

router.delete("/:userId", authMiddleware, async (req, res) => {
  const { Follow } = getModels();
  const { userId } = req.params;

  try {
    const destroyedCount = await Follow.destroy({
      where: { followerId: req.user.id, followeeId: userId },
    });

    if (destroyedCount > 0) {
      await logUserActionSafe({
        req,
        userId: req.user.id,
        actionType: "user_unfollow",
        targetType: "user",
        targetId: userId,
        metadata: {
          route: "/api/follows/:userId",
          method: req.method,
          followeeId: userId,
        },
      });
    }

    const followerCount = await Follow.count({ where: { followeeId: userId } });
    return res.json({ following: false, followerCount });
  } catch (err) {
    console.error("Unfollow failed:", err);
    return res.status(500).json({ message: "Failed to unfollow user." });
  }
});

module.exports = router;
