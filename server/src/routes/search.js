const express = require("express");
const { Op } = require("sequelize");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const VALID_TABS = new Set(["overall", "users", "social", "marketplace", "quilts"]);
const DEFAULT_TAB = "overall";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const DEFAULT_SECTION_LIMIT = 5;
const MAX_SECTION_LIMIT = 10;
const MAX_QUERY_LENGTH = 80;
const MIN_QUERY_LENGTH = 2;
const MAX_TOKENS = 8;

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeQuery(rawQuery) {
  if (typeof rawQuery !== "string") return "";
  return rawQuery.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

function normalizeTab(rawTab) {
  const parsed = typeof rawTab === "string" ? rawTab.trim().toLowerCase() : DEFAULT_TAB;
  return VALID_TABS.has(parsed) ? parsed : null;
}

function tokenizeQuery(query) {
  if (!query) return [];
  return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, MAX_TOKENS);
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function scoreTextField(value, query, tokens, weights) {
  const text = normalizeText(value);
  if (!text) return 0;

  let score = 0;
  if (text === query) score += weights.exact;
  if (text.startsWith(query)) score += weights.prefix;
  if (text.includes(query)) score += weights.contains;

  for (const token of tokens) {
    if (!token || token === query) continue;
    if (text === token) score += Math.round(weights.exact * 0.55);
    else if (text.startsWith(token)) score += weights.tokenPrefix;
    else if (text.includes(token)) score += weights.tokenContains;
  }

  return score;
}

function compareRankedItems(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const aCreated = new Date(a.createdAt).getTime();
  const bCreated = new Date(b.createdAt).getTime();
  return bCreated - aCreated;
}

function buildPagination(total, offset, limit) {
  const safeOffset = Math.max(offset, 0);
  const nextOffset = safeOffset + limit;
  return {
    offset: safeOffset,
    limit,
    total,
    hasMore: nextOffset < total,
    nextOffset,
  };
}

function paginate(items, offset, limit) {
  const safeOffset = Math.max(offset, 0);
  return items.slice(safeOffset, safeOffset + limit);
}

function buildUserWhere(query, tokens) {
  const patterns = [`%${query}%`, ...tokens.map((token) => `%${token}%`)];
  const fields = ["username", "name", "bio"];
  const ors = [];
  for (const field of fields) {
    for (const pattern of patterns) {
      ors.push({ [field]: { [Op.iLike]: pattern } });
    }
  }

  return { [Op.or]: ors };
}

function scoreUser(user, query, tokens) {
  return (
    scoreTextField(user.username, query, tokens, {
      exact: 130,
      prefix: 95,
      contains: 68,
      tokenPrefix: 22,
      tokenContains: 10,
    }) +
    scoreTextField(user.name, query, tokens, {
      exact: 110,
      prefix: 78,
      contains: 54,
      tokenPrefix: 18,
      tokenContains: 8,
    }) +
    scoreTextField(user.bio, query, tokens, {
      exact: 42,
      prefix: 26,
      contains: 16,
      tokenPrefix: 7,
      tokenContains: 4,
    })
  );
}

function scorePost(post, query, tokens) {
  return (
    scoreTextField(post.caption, query, tokens, {
      exact: 95,
      prefix: 68,
      contains: 48,
      tokenPrefix: 15,
      tokenContains: 7,
    }) +
    scoreTextField(post.author?.username, query, tokens, {
      exact: 110,
      prefix: 82,
      contains: 58,
      tokenPrefix: 18,
      tokenContains: 8,
    }) +
    scoreTextField(post.author?.name, query, tokens, {
      exact: 88,
      prefix: 64,
      contains: 45,
      tokenPrefix: 14,
      tokenContains: 6,
    })
  );
}

function scoreQuilt(quilt, query, tokens) {
  return (
    scoreTextField(quilt.name, query, tokens, {
      exact: 125,
      prefix: 92,
      contains: 65,
      tokenPrefix: 21,
      tokenContains: 9,
    }) +
    scoreTextField(quilt.description, query, tokens, {
      exact: 48,
      prefix: 30,
      contains: 18,
      tokenPrefix: 8,
      tokenContains: 4,
    }) +
    scoreTextField(quilt.owner?.username, query, tokens, {
      exact: 92,
      prefix: 66,
      contains: 46,
      tokenPrefix: 14,
      tokenContains: 6,
    }) +
    scoreTextField(quilt.owner?.name, query, tokens, {
      exact: 76,
      prefix: 56,
      contains: 38,
      tokenPrefix: 12,
      tokenContains: 5,
    })
  );
}

function mapUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    bio: user.bio || "",
    profilePicture: user.profilePicture || null,
  };
}

function mapPost(post) {
  return {
    id: post.id,
    type: post.type,
    caption: post.caption || "",
    imageUrl: post.imageUrl,
    priceCents: post.priceCents,
    isSold: post.isSold,
    createdAt: post.createdAt,
    author: post.author
      ? {
          id: post.author.id,
          username: post.author.username,
          name: post.author.name,
          profilePicture: post.author.profilePicture,
        }
      : null,
  };
}

function mapQuilt(quilt) {
  const previewImages = (quilt.patches || [])
    .map((patch) => patch.post?.imageUrl)
    .filter(Boolean)
    .slice(0, 9);

  return {
    id: quilt.id,
    name: quilt.name,
    description: quilt.description || "",
    createdAt: quilt.createdAt,
    patchCount: Array.isArray(quilt.patches) ? quilt.patches.length : 0,
    previewImages,
    owner: quilt.owner
      ? {
          id: quilt.owner.id,
          username: quilt.owner.username,
          name: quilt.owner.name,
          profilePicture: quilt.owner.profilePicture,
        }
      : null,
  };
}

async function fetchUsers({ query, tokens, offset, limit }) {
  const { User } = getModels();
  const rows = await User.findAll({
    where: buildUserWhere(query, tokens),
    attributes: ["id", "username", "name", "bio", "profilePicture", "createdAt"],
  });

  const ranked = rows
    .map((row) => {
      const user = row.toJSON();
      return {
        ...user,
        score: scoreUser(user, query, tokens),
      };
    })
    .filter((user) => user.score > 0)
    .sort(compareRankedItems);

  const total = ranked.length;
  return {
    items: paginate(ranked, offset, limit).map(mapUser),
    total,
    hasMore: offset + limit < total,
    pagination: buildPagination(total, offset, limit),
  };
}

async function fetchPosts({ query, tokens, offset, limit, viewerId, type }) {
  const { Post, User } = getModels();

  const rows = await Post.findAll({
    where: {
      type,
      [Op.or]: [{ isPublic: true }, { userId: viewerId }],
    },
    include: [
      {
        model: User,
        as: "author",
        attributes: ["id", "username", "name", "profilePicture"],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  const ranked = rows
    .map((row) => {
      const post = row.toJSON();
      return {
        ...post,
        score: scorePost(post, query, tokens),
      };
    })
    .filter((post) => post.score > 0)
    .sort(compareRankedItems);

  const total = ranked.length;
  return {
    items: paginate(ranked, offset, limit).map(mapPost),
    total,
    hasMore: offset + limit < total,
    pagination: buildPagination(total, offset, limit),
  };
}

async function fetchQuilts({ query, tokens, offset, limit, viewerId }) {
  const { Quilt, User, Patch, Post } = getModels();

  const rows = await Quilt.findAll({
    where: {
      [Op.or]: [{ isPublic: true }, { userId: viewerId }],
    },
    include: [
      {
        model: User,
        as: "owner",
        attributes: ["id", "username", "name", "profilePicture"],
      },
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
    order: [["createdAt", "DESC"]],
  });

  const ranked = rows
    .map((row) => {
      const quilt = row.toJSON();
      return {
        ...quilt,
        score: scoreQuilt(quilt, query, tokens),
      };
    })
    .filter((quilt) => quilt.score > 0)
    .sort(compareRankedItems);

  const total = ranked.length;
  return {
    items: paginate(ranked, offset, limit).map(mapQuilt),
    total,
    hasMore: offset + limit < total,
    pagination: buildPagination(total, offset, limit),
  };
}

function emptySections() {
  return {
    users: { items: [], total: 0, hasMore: false },
    social: { items: [], total: 0, hasMore: false },
    marketplace: { items: [], total: 0, hasMore: false },
    quilts: { items: [], total: 0, hasMore: false },
  };
}

router.get("/", authMiddleware, async (req, res) => {
  const query = normalizeQuery(req.query.q);
  const tab = normalizeTab(req.query.tab);
  const limit = clamp(toInt(req.query.limit, DEFAULT_LIMIT), 1, MAX_LIMIT);
  const offset = clamp(toInt(req.query.offset, 0), 0, 10000);
  const sectionLimit = clamp(toInt(req.query.sectionLimit, DEFAULT_SECTION_LIMIT), 1, MAX_SECTION_LIMIT);

  if (!tab) {
    return res.status(400).json({ message: "Invalid tab. Must be overall, users, social, marketplace, or quilts." });
  }

  if (query.length < MIN_QUERY_LENGTH) {
    if (tab === "overall") {
      return res.json({
        query,
        tab,
        sections: emptySections(),
      });
    }

    return res.json({
      query,
      tab,
      items: [],
      pagination: buildPagination(0, offset, limit),
    });
  }

  const tokens = tokenizeQuery(query);

  try {
    if (tab === "overall") {
      const [usersResult, socialResult, marketplaceResult, quiltsResult] = await Promise.all([
        fetchUsers({ query: query.toLowerCase(), tokens, offset: 0, limit: sectionLimit }),
        fetchPosts({
          query: query.toLowerCase(),
          tokens,
          offset: 0,
          limit: sectionLimit,
          viewerId: req.user.id,
          type: "regular",
        }),
        fetchPosts({
          query: query.toLowerCase(),
          tokens,
          offset: 0,
          limit: sectionLimit,
          viewerId: req.user.id,
          type: "market",
        }),
        fetchQuilts({ query: query.toLowerCase(), tokens, offset: 0, limit: sectionLimit, viewerId: req.user.id }),
      ]);

      return res.json({
        query,
        tab,
        sections: {
          users: {
            items: usersResult.items,
            total: usersResult.total,
            hasMore: usersResult.hasMore,
          },
          social: {
            items: socialResult.items,
            total: socialResult.total,
            hasMore: socialResult.hasMore,
          },
          marketplace: {
            items: marketplaceResult.items,
            total: marketplaceResult.total,
            hasMore: marketplaceResult.hasMore,
          },
          quilts: {
            items: quiltsResult.items,
            total: quiltsResult.total,
            hasMore: quiltsResult.hasMore,
          },
        },
      });
    }

    let result;
    if (tab === "users") {
      result = await fetchUsers({ query: query.toLowerCase(), tokens, offset, limit });
    } else if (tab === "social") {
      result = await fetchPosts({
        query: query.toLowerCase(),
        tokens,
        offset,
        limit,
        viewerId: req.user.id,
        type: "regular",
      });
    } else if (tab === "marketplace") {
      result = await fetchPosts({
        query: query.toLowerCase(),
        tokens,
        offset,
        limit,
        viewerId: req.user.id,
        type: "market",
      });
    } else {
      result = await fetchQuilts({ query: query.toLowerCase(), tokens, offset, limit, viewerId: req.user.id });
    }

    return res.json({
      query,
      tab,
      items: result.items,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Search failed:", err);
    return res.status(500).json({ message: "Failed to perform search." });
  }
});

module.exports = router;
