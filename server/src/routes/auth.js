const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op, UniqueConstraintError } = require("sequelize");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const SALT_ROUNDS = 10;
const SIZE_CATEGORY_KEYS = ["tops", "bottoms", "dresses", "outerwear", "shoes"];
const SIZE_ENTRY_KEYS = ["label", "measurementName", "measurementValue", "measurementUnit"];
const SIZE_MEASUREMENT_UNITS = new Set(["in", "cm"]);
const MAX_BIO_LENGTH = 500;
const MAX_BRANDS = 20;
const MAX_BRAND_LENGTH = 40;
const MAX_SIZE_ENTRIES_PER_CATEGORY = 10;
const MAX_SIZE_LABEL_LENGTH = 40;
const MAX_MEASUREMENT_NAME_LENGTH = 40;

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

function emptySizePreferences() {
  return {
    tops: [],
    bottoms: [],
    dresses: [],
    outerwear: [],
    shoes: [],
  };
}

function normalizeStoredSizePreferences(rawSizePreferences) {
  const normalized = emptySizePreferences();
  if (!rawSizePreferences || typeof rawSizePreferences !== "object" || Array.isArray(rawSizePreferences)) {
    return normalized;
  }

  for (const category of SIZE_CATEGORY_KEYS) {
    const rawEntries = rawSizePreferences[category];
    if (!Array.isArray(rawEntries)) continue;

    normalized[category] = rawEntries
      .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => {
        if (typeof entry.label !== "string") return null;
        const label = entry.label.trim();
        if (!label) return null;

        const normalizedEntry = { label };

        if (typeof entry.measurementName === "string") {
          const measurementName = entry.measurementName.trim();
          if (measurementName) normalizedEntry.measurementName = measurementName;
        }

        if (
          typeof entry.measurementValue === "number" &&
          Number.isFinite(entry.measurementValue) &&
          entry.measurementValue > 0
        ) {
          normalizedEntry.measurementValue = entry.measurementValue;
        }

        if (
          typeof entry.measurementUnit === "string" &&
          SIZE_MEASUREMENT_UNITS.has(entry.measurementUnit)
        ) {
          normalizedEntry.measurementUnit = entry.measurementUnit;
        }

        return normalizedEntry;
      })
      .filter(Boolean);
  }

  return normalized;
}

function serializeUser(user) {
  const favoriteBrands = Array.isArray(user.favoriteBrands)
    ? user.favoriteBrands
        .filter((brand) => typeof brand === "string")
        .map((brand) => brand.trim())
        .filter(Boolean)
    : [];
  const onboardingStatus = user.onboardingStatus || "pending";
  const onboardingPromptSeen = Boolean(user.onboardingPromptSeen);

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    bio: typeof user.bio === "string" ? user.bio : "",
    avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : "",
    sizePreferences: normalizeStoredSizePreferences(user.sizePreferences),
    favoriteBrands,
    onboardingStatus,
    onboardingPromptSeen,
    shouldShowOnboardingPrompt: onboardingStatus === "pending" && !onboardingPromptSeen,
  };
}

function validateAvatarUrl(avatarUrl) {
  if (avatarUrl === undefined) return { value: undefined };
  if (avatarUrl === null || avatarUrl === "") return { value: null };
  if (typeof avatarUrl !== "string") {
    return { error: "Avatar URL must be a string." };
  }

  const trimmed = avatarUrl.trim();
  if (!trimmed) return { value: null };

  const isDataUrl = trimmed.startsWith("data:image/");
  const isHttpUrl = /^https?:\/\//i.test(trimmed);
  if (!isDataUrl && !isHttpUrl) {
    return { error: "Avatar URL must be a valid image data URL or http(s) URL." };
  }

  if (trimmed.length > 2_000_000) {
    return { error: "Avatar image is too large." };
  }

  return { value: trimmed };
}

function validateName(name) {
  if (name === undefined) return { value: undefined };
  if (typeof name !== "string") {
    return { error: "Name must be a string." };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "Name is required." };
  }

  return { value: trimmed };
}

function validateUsername(username) {
  if (username === undefined) return { value: undefined };
  if (typeof username !== "string") {
    return { error: "Username must be a string." };
  }

  const trimmed = username.trim().toLowerCase();
  if (!trimmed) {
    return { error: "Username is required." };
  }

  return { value: trimmed };
}

function validateBio(bio) {
  if (bio === undefined) return { value: undefined };
  if (typeof bio !== "string") {
    return { error: "Bio must be a string." };
  }

  const trimmed = bio.trim();
  if (trimmed.length > MAX_BIO_LENGTH) {
    return { error: `Bio cannot be longer than ${MAX_BIO_LENGTH} characters.` };
  }

  return { value: trimmed };
}

function validateFavoriteBrands(favoriteBrands) {
  if (favoriteBrands === undefined) return { value: undefined };
  if (!Array.isArray(favoriteBrands)) {
    return { error: "Favorite brands must be an array." };
  }

  const seen = new Set();
  const cleaned = [];

  for (const brand of favoriteBrands) {
    if (typeof brand !== "string") {
      return { error: "Each favorite brand must be a string." };
    }

    const trimmed = brand.trim();
    if (!trimmed) continue;

    if (trimmed.length > MAX_BRAND_LENGTH) {
      return { error: `Favorite brands cannot exceed ${MAX_BRAND_LENGTH} characters each.` };
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }

  if (cleaned.length > MAX_BRANDS) {
    return { error: `You can save up to ${MAX_BRANDS} favorite brands.` };
  }

  return { value: cleaned };
}

function validateSizePreferences(sizePreferences) {
  if (sizePreferences === undefined) return { value: undefined };
  if (!sizePreferences || typeof sizePreferences !== "object" || Array.isArray(sizePreferences)) {
    return { error: "Size preferences must be an object." };
  }

  const invalidCategories = Object.keys(sizePreferences).filter(
    (category) => !SIZE_CATEGORY_KEYS.includes(category)
  );
  if (invalidCategories.length > 0) {
    return { error: `Invalid size categories: ${invalidCategories.join(", ")}.` };
  }

  const normalized = emptySizePreferences();

  for (const category of SIZE_CATEGORY_KEYS) {
    const rawEntries = sizePreferences[category];
    if (rawEntries === undefined) continue;

    if (!Array.isArray(rawEntries)) {
      return { error: `Size preferences for "${category}" must be an array.` };
    }

    if (rawEntries.length > MAX_SIZE_ENTRIES_PER_CATEGORY) {
      return {
        error: `Size preferences for "${category}" cannot exceed ${MAX_SIZE_ENTRIES_PER_CATEGORY} entries.`,
      };
    }

    const normalizedEntries = [];

    for (let index = 0; index < rawEntries.length; index += 1) {
      const entry = rawEntries[index];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return { error: `Each size entry for "${category}" must be an object.` };
      }

      const invalidFields = Object.keys(entry).filter((key) => !SIZE_ENTRY_KEYS.includes(key));
      if (invalidFields.length > 0) {
        return {
          error: `Invalid fields for "${category}" entry ${index + 1}: ${invalidFields.join(", ")}.`,
        };
      }

      if (typeof entry.label !== "string") {
        return { error: `Size entry label for "${category}" must be a string.` };
      }

      const label = entry.label.trim();
      if (!label) {
        return { error: `Size entry label for "${category}" cannot be empty.` };
      }
      if (label.length > MAX_SIZE_LABEL_LENGTH) {
        return {
          error: `Size entry label for "${category}" cannot exceed ${MAX_SIZE_LABEL_LENGTH} characters.`,
        };
      }

      const normalizedEntry = { label };

      if (entry.measurementName !== undefined) {
        if (typeof entry.measurementName !== "string") {
          return { error: `Measurement name for "${category}" must be a string.` };
        }
        const measurementName = entry.measurementName.trim();
        if (!measurementName) {
          return { error: `Measurement name for "${category}" cannot be empty.` };
        }
        if (measurementName.length > MAX_MEASUREMENT_NAME_LENGTH) {
          return {
            error: `Measurement name for "${category}" cannot exceed ${MAX_MEASUREMENT_NAME_LENGTH} characters.`,
          };
        }
        normalizedEntry.measurementName = measurementName;
      }

      if (entry.measurementValue !== undefined) {
        if (typeof entry.measurementValue !== "number" || !Number.isFinite(entry.measurementValue)) {
          return { error: `Measurement value for "${category}" must be a number.` };
        }
        if (entry.measurementValue <= 0) {
          return { error: `Measurement value for "${category}" must be greater than 0.` };
        }
        normalizedEntry.measurementValue = entry.measurementValue;
      }

      if (entry.measurementUnit !== undefined) {
        if (
          typeof entry.measurementUnit !== "string" ||
          !SIZE_MEASUREMENT_UNITS.has(entry.measurementUnit)
        ) {
          return { error: `Measurement unit for "${category}" must be "in" or "cm".` };
        }
        normalizedEntry.measurementUnit = entry.measurementUnit;
      }

      if (
        normalizedEntry.measurementValue !== undefined &&
        normalizedEntry.measurementUnit === undefined
      ) {
        return { error: `Measurement unit is required when measurement value is provided.` };
      }

      normalizedEntries.push(normalizedEntry);
    }

    normalized[category] = normalizedEntries;
  }

  return { value: normalized };
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
      user: serializeUser(user),
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
      user: serializeUser(user),
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
      attributes: [
        "id",
        "email",
        "username",
        "name",
        "bio",
        "avatarUrl",
        "sizePreferences",
        "favoriteBrands",
        "onboardingStatus",
        "onboardingPromptSeen",
      ],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user: serializeUser(user) });
  } catch (err) {
    console.error("Me error", err);
    return res.status(500).json({ message: "Something went wrong." });
  }
});

router.patch("/me", authMiddleware, async (req, res) => {
  const { name, username, bio, avatarUrl, sizePreferences, favoriteBrands } = req.body || {};

  try {
    const { User } = getModels();
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const validatedName = validateName(name);
    if (validatedName.error) return res.status(400).json({ message: validatedName.error });

    const validatedUsername = validateUsername(username);
    if (validatedUsername.error) return res.status(400).json({ message: validatedUsername.error });

    const validatedBio = validateBio(bio);
    if (validatedBio.error) return res.status(400).json({ message: validatedBio.error });

    const validatedAvatarUrl = validateAvatarUrl(avatarUrl);
    if (validatedAvatarUrl.error) {
      return res.status(400).json({ message: validatedAvatarUrl.error });
    }

    const validatedSizePreferences = validateSizePreferences(sizePreferences);
    if (validatedSizePreferences.error) {
      return res.status(400).json({ message: validatedSizePreferences.error });
    }

    const validatedFavoriteBrands = validateFavoriteBrands(favoriteBrands);
    if (validatedFavoriteBrands.error) {
      return res.status(400).json({ message: validatedFavoriteBrands.error });
    }

    // Check if username is being changed and if it's already taken
    if (validatedUsername.value && validatedUsername.value !== user.username) {
      const existingUsername = await User.findOne({
        where: { username: validatedUsername.value },
      });
      if (existingUsername) {
        return res.status(409).json({ message: "Username already in use." });
      }
      user.username = validatedUsername.value;
    }

    if (validatedName.value !== undefined) user.name = validatedName.value;
    if (validatedBio.value !== undefined) user.bio = validatedBio.value;
    if (validatedAvatarUrl.value !== undefined) user.avatarUrl = validatedAvatarUrl.value;
    if (validatedSizePreferences.value !== undefined) {
      user.sizePreferences = validatedSizePreferences.value;
    }
    if (validatedFavoriteBrands.value !== undefined) {
      user.favoriteBrands = validatedFavoriteBrands.value;
    }

    await user.save();

    return res.json({
      user: serializeUser(user),
    });
  } catch (err) {
    console.error("Update profile error", err);
    return res.status(500).json({ message: "Something went wrong." });
  }
});

router.post("/me/onboarding", authMiddleware, async (req, res) => {
  const { action, bio, sizePreferences, favoriteBrands } = req.body || {};

  if (action !== "complete" && action !== "skip") {
    return res.status(400).json({ message: 'Action must be either "complete" or "skip".' });
  }

  try {
    const { User } = getModels();
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (action === "complete") {
      const validatedBio = validateBio(bio);
      if (validatedBio.error) return res.status(400).json({ message: validatedBio.error });

      const validatedSizePreferences = validateSizePreferences(sizePreferences);
      if (validatedSizePreferences.error) {
        return res.status(400).json({ message: validatedSizePreferences.error });
      }

      const validatedFavoriteBrands = validateFavoriteBrands(favoriteBrands);
      if (validatedFavoriteBrands.error) {
        return res.status(400).json({ message: validatedFavoriteBrands.error });
      }

      if (validatedBio.value !== undefined) user.bio = validatedBio.value;
      if (validatedSizePreferences.value !== undefined) {
        user.sizePreferences = validatedSizePreferences.value;
      }
      if (validatedFavoriteBrands.value !== undefined) {
        user.favoriteBrands = validatedFavoriteBrands.value;
      }

      user.onboardingStatus = "completed";
    } else {
      if (user.onboardingStatus !== "completed") {
        user.onboardingStatus = "skipped";
      }
    }

    user.onboardingPromptSeen = true;
    await user.save();

    return res.json({
      user: serializeUser(user),
    });
  } catch (err) {
    console.error("Onboarding update error", err);
    return res.status(500).json({ message: "Something went wrong." });
  }
});

module.exports = router;
