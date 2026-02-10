const express = require("express");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");
const {
  normalizeRecommendationType,
  parseRecommendationPaging,
  fetchChronologicalRecommendations,
} = require("../services/recommendations");

const router = express.Router();

router.get("/", authMiddleware, async (req, res) => {
  const rawType = req.query.type;
  const type = rawType ? normalizeRecommendationType(rawType) : null;
  if (rawType && !type) {
    return res.status(400).json({ message: "Type must be either 'regular' or 'market'." });
  }

  const { limit, offset } = parseRecommendationPaging(req.query);

  try {
    const models = getModels();
    const posts = await fetchChronologicalRecommendations({
      models,
      type,
      limit,
      offset,
      userId: req.user.id,
    });

    return res.json({
      algorithm: "chronological_fallback",
      personalized: false,
      posts,
      pagination: {
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("Recommendation fetch failed:", err);
    return res.status(500).json({ message: "Failed to fetch recommendations." });
  }
});

module.exports = router;
