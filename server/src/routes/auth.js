const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op, UniqueConstraintError } = require("sequelize");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const SALT_ROUNDS = 10;

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

router.post("/register", async (req, res) => {
  const { email, username, name, password } = req.body || {};

  if (!email || !username || !name || !password) {
    return res.status(400).json({ message: "All fields are required." });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }

  try {
    const { User } = getModels();
    const existingEmail = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingEmail) {
      return res.status(409).json({ message: "Email already in use." });
    }

    const existingUsername = await User.findOne({
      where: { username: username.toLowerCase() },
    });
    if (existingUsername) {
      return res.status(409).json({ message: "Username already in use." });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      name: name.trim(),
      passwordHash,
    });

    const token = signToken(user);
    return res.status(201).json({
      token,
      user: { id: user.id, email: user.email, username: user.username, name: user.name, bio: user.bio || "" },
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      return res.status(409).json({ message: "Email or username already in use." });
    }
    console.error("Register error", err);
    return res.status(500).json({ message: "Something went wrong." });
  }
});

router.post("/login", async (req, res) => {
  const { emailOrUsername, password } = req.body || {};

  if (!emailOrUsername || !password) {
    return res.status(400).json({ message: "Email/username and password are required." });
  }

  try {
    const { User } = getModels();
    const lookup = emailOrUsername.toLowerCase();
    const user = await User.findOne({
      where: {
        [Op.or]: [{ email: lookup }, { username: lookup }],
      },
    });

    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: "Invalid credentials." });

    const token = signToken(user);
    return res.json({
      token,
      user: { id: user.id, email: user.email, username: user.username, name: user.name, bio: user.bio || "" },
    });
  } catch (err) {
    console.error("Login error", err);
    return res.status(500).json({ message: "Something went wrong." });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "email", "username", "name", "bio"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user });
  } catch (err) {
    console.error("Me error", err);
    return res.status(500).json({ message: "Something went wrong." });
  }
});

router.patch("/me", authMiddleware, async (req, res) => {
  const { name, username, bio } = req.body || {};

  try {
    const { User } = getModels();
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if username is being changed and if it's already taken
    if (username && username.toLowerCase() !== user.username) {
      const existingUsername = await User.findOne({
        where: { username: username.toLowerCase() },
      });
      if (existingUsername) {
        return res.status(409).json({ message: "Username already in use." });
      }
      user.username = username.toLowerCase();
    }

    if (name !== undefined) user.name = name.trim();
    if (bio !== undefined) user.bio = bio;

    await user.save();

    return res.json({
      user: { id: user.id, email: user.email, username: user.username, name: user.name, bio: user.bio || "" },
    });
  } catch (err) {
    console.error("Update profile error", err);
    return res.status(500).json({ message: "Something went wrong." });
  }
});

module.exports = router;
