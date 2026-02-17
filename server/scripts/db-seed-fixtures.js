"use strict";

require("dotenv").config();

const bcrypt = require("bcryptjs");
const { Client } = require("pg");
const { insertRows } = require("./db-restore-json");
const { TABLE_INSERT_ORDER } = require("./db-backup-helpers");

const DEFAULT_SEED = 422;
const USER_COUNT = 120;
const POST_COUNT = 1500;
const REGULAR_POST_RATIO = 0.6;
const UNKNOWN = "unknown";

const ONBOARDING_STATUS = ["completed", "completed", "completed", "skipped", "pending"];
const STYLE_TAG_POOL = [
  "casual",
  "minimalist",
  "streetwear",
  "vintage",
  "boho",
  "athleisure",
  "preppy",
  "formal",
  "grunge",
  "y2k",
  "cozy",
  "eclectic",
  "retro",
  "chic",
  "edgy",
  "classic",
  "festival",
  "artsy",
];
const COLOR_TAG_POOL = [
  "black",
  "white",
  "gray",
  "beige",
  "brown",
  "blue",
  "navy",
  "green",
  "red",
  "pink",
  "purple",
  "yellow",
  "orange",
  "multicolor",
];
const BRAND_POOL = [
  "Nike",
  "Adidas",
  "Levi's",
  "Zara",
  "H&M",
  "Uniqlo",
  "Madewell",
  "Aritzia",
  "Lululemon",
  "Patagonia",
  "The North Face",
  "Carhartt",
  "New Balance",
  "Converse",
  "Doc Martens",
  "Reformation",
  "Everlane",
  "Urban Outfitters",
];
const CATEGORIES = [
  "tops",
  "bottoms",
  "dresses",
  "outerwear",
  "shoes",
  "bags",
  "accessories",
  "activewear",
];
const SUBCATEGORY_MAP = {
  tops: ["t_shirt", "blouse", "button_down", "sweater", "hoodie", "tank"],
  bottoms: ["jeans", "trousers", "shorts", "skirt", "leggings"],
  dresses: ["mini_dress", "midi_dress", "maxi_dress", "slip_dress", "bodycon"],
  outerwear: ["jacket", "coat", "blazer", "cardigan", "vest"],
  shoes: ["sneakers", "boots", "heels", "flats", "sandals", "loafers"],
  bags: ["tote", "crossbody", "backpack", "shoulder_bag", "clutch"],
  accessories: ["jewelry", "belt", "hat", "scarf", "sunglasses"],
  activewear: ["sports_bra", "athletic_top", "athletic_shorts", "athletic_leggings", "track_jacket"],
};
const CONDITIONS = ["new_with_tags", "like_new", "gently_used", "used", "well_worn"];
const SIZE_LABELS = [
  "one_size",
  "xxs",
  "xs",
  "s",
  "m",
  "l",
  "xl",
  "xxl",
  "numeric_0",
  "numeric_2",
  "numeric_4",
  "numeric_6",
  "numeric_8",
  "numeric_10",
  "numeric_12",
  "numeric_14",
  "shoe_7",
  "shoe_8",
  "shoe_9",
  "shoe_10",
];
const SOURCE_SURFACES = ["social_feed", "post_detail", "profile", "search_results"];
const FEED_TYPES = ["all", "regular", "market"];
const COMMENT_TEMPLATES = [
  "Love this look.",
  "This styling is so good.",
  "Where did you find this piece?",
  "Great color combo.",
  "This is exactly my vibe.",
  "Obsessed with this fit.",
  "Would wear this every day.",
  "So clean and well put together.",
];
const MESSAGE_TEMPLATES = [
  "Hey! Is this still available?",
  "Love your recent posts.",
  "Thanks for following me!",
  "Would you be open to a bundle?",
  "This outfit inspo is amazing.",
  "Do you have this in another size?",
  "Can you share more details on this item?",
];
const BIO_SNIPPETS = [
  "curating thrifted and upcycled looks",
  "posting daily style notes",
  "sharing moodboards and closet edits",
  "mixing vintage with modern staples",
  "building a sustainable wardrobe",
  "all about texture and layered fits",
];

function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickOne(rng, values) {
  return values[randomInt(rng, 0, values.length - 1)];
}

function pickManyUnique(rng, values, count) {
  const copy = [...values];
  const picked = [];
  const target = Math.min(count, copy.length);
  for (let i = 0; i < target; i += 1) {
    const index = randomInt(rng, 0, copy.length - 1);
    picked.push(copy[index]);
    copy.splice(index, 1);
  }
  return picked;
}

function seededUuid(rng) {
  const bytes = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function randomDateWithinDays(rng, daysBack) {
  const now = Date.now();
  const rangeMs = daysBack * 24 * 60 * 60 * 1000;
  const delta = Math.floor(rng() * rangeMs);
  return new Date(now - delta);
}

function randomDateBetween(rng, fromDate, toDate) {
  const fromMs = new Date(fromDate).getTime();
  const toMs = new Date(toDate).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return new Date(fromDate);
  }
  const delta = Math.floor(rng() * (toMs - fromMs));
  return new Date(fromMs + delta);
}

function normalizeRecordTimestamps(record, fallbackDate) {
  const nowDate = fallbackDate || new Date();
  return {
    ...record,
    created_at: record.created_at || nowDate,
    updated_at: record.updated_at || record.created_at || nowDate,
  };
}

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const raw = token.slice(2);
    const eqIndex = raw.indexOf("=");
    if (eqIndex === -1) {
      args[raw] = true;
    } else {
      args[raw.slice(0, eqIndex)] = raw.slice(eqIndex + 1);
    }
  }
  return args;
}

async function getTableColumns(client, tableName) {
  const query = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position ASC;
  `;
  const result = await client.query(query, [tableName]);
  return result.rows.map((row) => row.column_name);
}

function normalizeRowsForColumns(rows, dbColumns) {
  if (!rows.length) return [];
  const dbColumnSet = new Set(dbColumns);
  const insertColumns = Object.keys(rows[0]).filter((column) => dbColumnSet.has(column));
  if (!insertColumns.length) return [];

  return rows.map((row) => {
    const normalized = {};
    for (const column of insertColumns) {
      normalized[column] = Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null;
    }
    return normalized;
  });
}

function buildUsers(rng, { adminId, adminPasswordHash }) {
  const users = [];
  const userIds = [];

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@patchwork.com";
  const adminUsername = (process.env.SEED_ADMIN_USERNAME || "admin").toLowerCase();
  const adminName = process.env.SEED_ADMIN_NAME || "Patchwork Admin";

  const adminCreatedAt = randomDateWithinDays(rng, 180);
  users.push(
    normalizeRecordTimestamps({
      id: adminId,
      email: adminEmail.toLowerCase(),
      username: adminUsername,
      name: adminName,
      role: "admin",
      bio: "Admin profile for recommendation simulation tooling.",
      size_preferences: {
        tops: [{ label: "M" }],
        bottoms: [{ label: "32" }],
        dresses: [],
        outerwear: [{ label: "M" }],
        shoes: [{ label: "9" }],
      },
      favorite_brands: pickManyUnique(rng, BRAND_POOL, 4),
      onboarding_status: "completed",
      onboarding_prompt_seen: true,
      profile_picture: `https://picsum.photos/seed/${adminUsername}/400/400`,
      password_hash: adminPasswordHash,
    }, adminCreatedAt)
  );
  userIds.push(adminId);

  for (let index = 1; index < USER_COUNT; index += 1) {
    const id = seededUuid(rng);
    userIds.push(id);
    const username = `user_${index}_${randomInt(rng, 1000, 9999)}`;
    const createdAt = randomDateWithinDays(rng, 420);
    const preferredBrands = pickManyUnique(rng, BRAND_POOL, randomInt(rng, 2, 6));
    const onboardingStatus = pickOne(rng, ONBOARDING_STATUS);

    users.push(
      normalizeRecordTimestamps(
        {
          id,
          email: `${username}@patchwork.local`,
          username,
          name: `User ${index}`,
          role: "user",
          bio: `${pickOne(rng, BIO_SNIPPETS)} · ${pickOne(rng, STYLE_TAG_POOL)}`,
          size_preferences: {
            tops: rng() < 0.8 ? [{ label: pickOne(rng, ["XS", "S", "M", "L", "XL"]) }] : [],
            bottoms: rng() < 0.6 ? [{ label: pickOne(rng, ["26", "28", "30", "32", "34"]) }] : [],
            dresses: rng() < 0.3 ? [{ label: pickOne(rng, ["XS", "S", "M", "L"]) }] : [],
            outerwear: rng() < 0.5 ? [{ label: pickOne(rng, ["S", "M", "L", "XL"]) }] : [],
            shoes: rng() < 0.4 ? [{ label: pickOne(rng, ["7", "8", "9", "10", "11"]) }] : [],
          },
          favorite_brands: preferredBrands,
          onboarding_status: onboardingStatus,
          onboarding_prompt_seen: onboardingStatus !== "pending",
          profile_picture: `https://picsum.photos/seed/${username}/400/400`,
          password_hash: null, // filled later with common hash
        },
        createdAt
      )
    );
  }

  return { users, userIds };
}

function buildPosts(rng, userIds) {
  const posts = [];
  const postOwnerById = new Map();
  const regularCount = Math.round(POST_COUNT * REGULAR_POST_RATIO);

  for (let index = 0; index < POST_COUNT; index += 1) {
    const id = seededUuid(rng);
    const isRegular = index < regularCount;
    const type = isRegular ? "regular" : "market";
    const userId = pickOne(rng, userIds);
    const createdAt = randomDateWithinDays(rng, 120);
    const styleTags = pickManyUnique(rng, STYLE_TAG_POOL, randomInt(rng, 1, isRegular ? 4 : 3));
    const colorTags = rng() < 0.75
      ? pickManyUnique(rng, COLOR_TAG_POOL, randomInt(rng, 1, 3))
      : [];

    if (isRegular) {
      posts.push(
        normalizeRecordTimestamps(
          {
            id,
            user_id: userId,
            type,
            caption: `Style note ${index + 1}: ${pickOne(rng, COMMENT_TEMPLATES)}`,
            image_url: `https://picsum.photos/seed/post-${index + 1}/900/1200`,
            price_cents: null,
            is_public: true,
            is_sold: false,
            category: UNKNOWN,
            subcategory: UNKNOWN,
            brand: rng() < 0.35 ? pickOne(rng, BRAND_POOL) : "",
            style_tags: styleTags,
            color_tags: colorTags,
            condition: UNKNOWN,
            size_label: UNKNOWN,
          },
          createdAt
        )
      );
      postOwnerById.set(id, userId);
      continue;
    }

    const category = pickOne(rng, CATEGORIES);
    const subcategory = rng() < 0.7 ? pickOne(rng, SUBCATEGORY_MAP[category]) : UNKNOWN;
    const condition = pickOne(rng, CONDITIONS);
    const sizeLabel = pickOne(rng, SIZE_LABELS);
    const isSold = rng() < 0.25;

    posts.push(
      normalizeRecordTimestamps(
        {
          id,
          user_id: userId,
          type,
          caption: `Listing ${index + 1}: ${pickOne(rng, COMMENT_TEMPLATES)}`,
          image_url: `https://picsum.photos/seed/post-${index + 1}/900/1200`,
          price_cents: randomInt(rng, 1200, 32000),
          is_public: true,
          is_sold: isSold,
          category,
          subcategory,
          brand: rng() < 0.6 ? pickOne(rng, BRAND_POOL) : "",
          style_tags: pickManyUnique(rng, STYLE_TAG_POOL, randomInt(rng, 0, 3)),
          color_tags: colorTags,
          condition,
          size_label: sizeLabel,
        },
        createdAt
      )
    );
    postOwnerById.set(id, userId);
  }

  return { posts, postOwnerById };
}

function buildFollows(rng, userIds) {
  const rows = [];
  const pairSet = new Set();

  for (const followerId of userIds) {
    const targetCount = randomInt(rng, 3, 8);
    const candidates = userIds.filter((id) => id !== followerId);
    for (const followeeId of pickManyUnique(rng, candidates, targetCount)) {
      const key = `${followerId}:${followeeId}`;
      if (pairSet.has(key)) continue;
      pairSet.add(key);
      rows.push(
        normalizeRecordTimestamps({
          id: seededUuid(rng),
          follower_id: followerId,
          followee_id: followeeId,
          created_at: randomDateWithinDays(rng, 90),
        })
      );
    }
  }

  return rows;
}

function buildLikes(rng, userIds, posts) {
  const rows = [];
  const pairs = new Set();
  const postIds = posts.map((post) => post.id);

  for (const userId of userIds) {
    const likeCount = randomInt(rng, 8, 25);
    const likedPosts = pickManyUnique(rng, postIds, likeCount);
    for (const postId of likedPosts) {
      const key = `${userId}:${postId}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      rows.push(
        normalizeRecordTimestamps({
          id: seededUuid(rng),
          user_id: userId,
          post_id: postId,
          created_at: randomDateWithinDays(rng, 60),
        })
      );
    }
  }

  return rows;
}

function buildComments(rng, userIds, posts) {
  const rows = [];
  const topLevelIds = [];
  const postById = new Map(posts.map((post) => [post.id, post]));

  const topLevelCount = 900;
  for (let i = 0; i < topLevelCount; i += 1) {
    const post = pickOne(rng, posts);
    const createdAt = randomDateBetween(rng, post.created_at, new Date());
    const id = seededUuid(rng);
    topLevelIds.push(id);
    rows.push(
      normalizeRecordTimestamps(
        {
          id,
          user_id: pickOne(rng, userIds),
          post_id: post.id,
          body: pickOne(rng, COMMENT_TEMPLATES),
          parent_id: null,
        },
        createdAt
      )
    );
  }

  const replyCount = 250;
  for (let i = 0; i < replyCount; i += 1) {
    const parentId = pickOne(rng, topLevelIds);
    const parent = rows.find((row) => row.id === parentId);
    const parentPost = postById.get(parent.post_id);
    const createdAt = randomDateBetween(rng, parent.created_at, new Date());
    rows.push(
      normalizeRecordTimestamps(
        {
          id: seededUuid(rng),
          user_id: pickOne(rng, userIds),
          post_id: parentPost.id,
          body: `Reply: ${pickOne(rng, COMMENT_TEMPLATES)}`,
          parent_id: parentId,
        },
        createdAt
      )
    );
  }

  return rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function buildCommentLikes(rng, userIds, comments) {
  const rows = [];
  const pairs = new Set();
  const sampleCount = Math.min(350, comments.length);
  const commentIds = comments.map((comment) => comment.id);
  for (let i = 0; i < sampleCount; i += 1) {
    const userId = pickOne(rng, userIds);
    const commentId = pickOne(rng, commentIds);
    const key = `${userId}:${commentId}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    rows.push(
      normalizeRecordTimestamps({
        id: seededUuid(rng),
        user_id: userId,
        comment_id: commentId,
        created_at: randomDateWithinDays(rng, 45),
      })
    );
  }
  return rows;
}

function buildQuiltsAndPatches(rng, userIds, posts) {
  const quilts = [];
  const patches = [];
  const postIds = posts.map((post) => post.id);
  const patchPairs = new Set();

  for (const userId of userIds) {
    const quiltCount = randomInt(rng, 0, 2);
    for (let i = 0; i < quiltCount; i += 1) {
      const quiltId = seededUuid(rng);
      quilts.push(
        normalizeRecordTimestamps({
          id: quiltId,
          user_id: userId,
          name: `Quilt ${randomInt(rng, 100, 999)}`,
          description: `Collection of favorite pieces #${randomInt(rng, 1, 9999)}`,
          is_public: rng() < 0.7,
          created_at: randomDateWithinDays(rng, 120),
        })
      );

      const patchCount = randomInt(rng, 4, 10);
      const quiltPosts = pickManyUnique(rng, postIds, patchCount);
      for (const postId of quiltPosts) {
        const key = `${quiltId}:${postId}`;
        if (patchPairs.has(key)) continue;
        patchPairs.add(key);
        patches.push(
          normalizeRecordTimestamps({
            id: seededUuid(rng),
            quilt_id: quiltId,
            post_id: postId,
            user_id: userId,
            created_at: randomDateWithinDays(rng, 90),
          })
        );
      }
    }
  }

  return { quilts, patches };
}

function buildConversationsAndMessages(rng, userIds) {
  const conversations = [];
  const participants = [];
  const messages = [];
  const participantMap = new Map();

  const conversationCount = 140;
  for (let i = 0; i < conversationCount; i += 1) {
    const conversationId = seededUuid(rng);
    const participantCount = rng() < 0.82 ? 2 : randomInt(rng, 3, 4);
    const pickedUsers = pickManyUnique(rng, userIds, participantCount);
    participantMap.set(conversationId, pickedUsers);

    conversations.push(
      normalizeRecordTimestamps({
        id: conversationId,
        created_at: randomDateWithinDays(rng, 120),
      })
    );

    for (const userId of pickedUsers) {
      participants.push(
        normalizeRecordTimestamps({
          id: seededUuid(rng),
          conversation_id: conversationId,
          user_id: userId,
          created_at: randomDateWithinDays(rng, 120),
        })
      );
    }

    const messageCount = randomInt(rng, 3, 8);
    let latestDate = new Date(0);
    for (let m = 0; m < messageCount; m += 1) {
      const createdAt = randomDateWithinDays(rng, 90);
      if (createdAt > latestDate) latestDate = createdAt;
      messages.push(
        normalizeRecordTimestamps(
          {
            id: seededUuid(rng),
            conversation_id: conversationId,
            sender_id: pickOne(rng, pickedUsers),
            body: pickOne(rng, MESSAGE_TEMPLATES),
          },
          createdAt
        )
      );
    }

    const conversation = conversations[conversations.length - 1];
    conversation.updated_at = latestDate;
  }

  return { conversations, conversationParticipants: participants, messages, participantMap };
}

function buildNotifications({
  rng,
  likes,
  comments,
  follows,
  patches,
  commentLikes,
  messages,
  postOwnerById,
  commentById,
  participantMap,
}) {
  const rows = [];

  const addNotification = ({ userId, actorId, type, postId = null, readChance = 0.4 }) => {
    if (!userId || !actorId || userId === actorId) return;
    rows.push(
      normalizeRecordTimestamps({
        id: seededUuid(rng),
        user_id: userId,
        actor_id: actorId,
        type,
        post_id: postId,
        read: rng() < readChance,
        created_at: randomDateWithinDays(rng, 60),
      })
    );
  };

  for (const like of likes.slice(0, 900)) {
    addNotification({
      userId: postOwnerById.get(like.post_id),
      actorId: like.user_id,
      type: "like",
      postId: like.post_id,
    });
  }

  for (const comment of comments.slice(0, 500)) {
    addNotification({
      userId: postOwnerById.get(comment.post_id),
      actorId: comment.user_id,
      type: "comment",
      postId: comment.post_id,
    });
  }

  for (const follow of follows.slice(0, 400)) {
    addNotification({
      userId: follow.followee_id,
      actorId: follow.follower_id,
      type: "follow",
      postId: null,
    });
  }

  for (const patch of patches.slice(0, 300)) {
    addNotification({
      userId: postOwnerById.get(patch.post_id),
      actorId: patch.user_id,
      type: "patch",
      postId: patch.post_id,
    });
  }

  for (const like of commentLikes.slice(0, 250)) {
    const comment = commentById.get(like.comment_id);
    addNotification({
      userId: comment?.user_id,
      actorId: like.user_id,
      type: "comment_like",
      postId: comment?.post_id || null,
    });
  }

  for (const message of messages.slice(0, 350)) {
    const participants = participantMap.get(message.conversation_id) || [];
    const recipient = participants.find((id) => id !== message.sender_id);
    addNotification({
      userId: recipient,
      actorId: message.sender_id,
      type: "message",
      postId: null,
    });
  }

  return rows;
}

function buildUserActions({
  rng,
  userIds,
  posts,
  likes,
  comments,
  follows,
  patches,
  commentLikes,
}) {
  const rows = [];
  const postIds = posts.map((post) => post.id);

  const pushAction = ({
    userId,
    actionType,
    targetType,
    targetId,
    metadataJson,
    sourceSurface = pickOne(rng, SOURCE_SURFACES),
    sessionId = null,
    occurredAt = randomDateWithinDays(rng, 30),
  }) => {
    rows.push(
      normalizeRecordTimestamps(
        {
          id: seededUuid(rng),
          user_id: userId,
          action_type: actionType,
          target_type: targetType,
          target_id: String(targetId),
          metadata_json: metadataJson || {},
          source_surface: sourceSurface,
          session_id: sessionId,
          occurred_at: occurredAt,
        },
        occurredAt
      )
    );
  };

  for (const userId of userIds) {
    const sessionCount = randomInt(rng, 2, 4);
    for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
      const sessionId = seededUuid(rng);
      const baseDate = randomDateWithinDays(rng, 20);
      const impressionCount = randomInt(rng, 14, 26);
      for (let rank = 1; rank <= impressionCount; rank += 1) {
        const postId = pickOne(rng, postIds);
        const requestId = seededUuid(rng);
        const feedType = pickOne(rng, FEED_TYPES);
        const algorithm = "chronological_fallback";
        const occurredAt = new Date(baseDate.getTime() + rank * randomInt(rng, 1500, 6000));
        const metadata = {
          requestId,
          feedType,
          rankPosition: rank,
          algorithm,
          postId,
          sessionId,
        };

        pushAction({
          userId,
          actionType: "feed_impression",
          targetType: "post",
          targetId: postId,
          metadataJson: metadata,
          sourceSurface: "social_feed",
          sessionId,
          occurredAt,
        });

        if (rng() < 0.22) {
          pushAction({
            userId,
            actionType: "feed_click",
            targetType: "post",
            targetId: postId,
            metadataJson: metadata,
            sourceSurface: "social_feed",
            sessionId,
            occurredAt: new Date(occurredAt.getTime() + randomInt(rng, 200, 1600)),
          });
        }

        if (rng() < 0.68) {
          pushAction({
            userId,
            actionType: "feed_dwell",
            targetType: "post",
            targetId: postId,
            metadataJson: {
              ...metadata,
              dwellMs: randomInt(rng, 350, 8400),
            },
            sourceSurface: "social_feed",
            sessionId,
            occurredAt: new Date(occurredAt.getTime() + randomInt(rng, 300, 3000)),
          });
        }
      }
    }
  }

  for (const like of likes.slice(0, 1200)) {
    pushAction({
      userId: like.user_id,
      actionType: "post_like",
      targetType: "post",
      targetId: like.post_id,
      metadataJson: { postId: like.post_id },
      sourceSurface: pickOne(rng, SOURCE_SURFACES),
      occurredAt: like.created_at,
    });
  }

  for (const comment of comments.slice(0, 700)) {
    pushAction({
      userId: comment.user_id,
      actionType: "comment_create",
      targetType: "comment",
      targetId: comment.id,
      metadataJson: { postId: comment.post_id, parentId: comment.parent_id || null },
      sourceSurface: "post_detail",
      occurredAt: comment.created_at,
    });
  }

  for (const follow of follows.slice(0, 500)) {
    pushAction({
      userId: follow.follower_id,
      actionType: "user_follow",
      targetType: "user",
      targetId: follow.followee_id,
      metadataJson: { followeeId: follow.followee_id },
      sourceSurface: "profile",
      occurredAt: follow.created_at,
    });
  }

  for (const patch of patches.slice(0, 350)) {
    pushAction({
      userId: patch.user_id,
      actionType: "post_patch_save",
      targetType: "post",
      targetId: patch.post_id,
      metadataJson: { postId: patch.post_id, quiltId: patch.quilt_id },
      sourceSurface: "post_detail",
      occurredAt: patch.created_at,
    });
  }

  for (const like of commentLikes.slice(0, 300)) {
    pushAction({
      userId: like.user_id,
      actionType: "comment_like",
      targetType: "comment",
      targetId: like.comment_id,
      metadataJson: { commentId: like.comment_id },
      sourceSurface: "post_detail",
      occurredAt: like.created_at,
    });
  }

  return rows;
}

function buildFixtureData({ seed, adminPasswordHash, defaultUserPasswordHash }) {
  const rng = createRng(seed);
  const adminId = seededUuid(rng);

  const { users, userIds } = buildUsers(rng, { adminId, adminPasswordHash });
  for (const user of users) {
    if (!user.password_hash) {
      user.password_hash = defaultUserPasswordHash;
    }
  }

  const { posts, postOwnerById } = buildPosts(rng, userIds);
  const follows = buildFollows(rng, userIds);
  const likes = buildLikes(rng, userIds, posts);
  const comments = buildComments(rng, userIds, posts);
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const commentLikes = buildCommentLikes(rng, userIds, comments);
  const { quilts, patches } = buildQuiltsAndPatches(rng, userIds, posts);
  const { conversations, conversationParticipants, messages, participantMap } = buildConversationsAndMessages(
    rng,
    userIds
  );
  const notifications = buildNotifications({
    rng,
    likes,
    comments,
    follows,
    patches,
    commentLikes,
    messages,
    postOwnerById,
    commentById,
    participantMap,
  });
  const userActions = buildUserActions({
    rng,
    userIds,
    posts,
    likes,
    comments,
    follows,
    patches,
    commentLikes,
  });

  return {
    users,
    conversations,
    posts,
    follows,
    conversation_participants: conversationParticipants,
    messages,
    user_actions: userActions,
    likes,
    comments,
    quilts,
    patches,
    comment_likes: commentLikes,
    notifications,
  };
}

async function seedFixtures({
  databaseUrl = process.env.DATABASE_URL,
  seed = DEFAULT_SEED,
} = {}) {
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL.");
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "testtest123";
  const defaultPassword = process.env.SEED_USER_PASSWORD || "Patchwork123!";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  const defaultUserPasswordHash = await bcrypt.hash(defaultPassword, 10);

  const fixtureData = buildFixtureData({
    seed,
    adminPasswordHash,
    defaultUserPasswordHash,
  });

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");

    for (const tableName of TABLE_INSERT_ORDER) {
      const rows = fixtureData[tableName] || [];
      const tableColumns = await getTableColumns(client, tableName);
      const compatibleRows = normalizeRowsForColumns(rows, tableColumns);
      await insertRows(client, tableName, compatibleRows);
    }

    await client.query("COMMIT");

    const counts = {};
    for (const tableName of TABLE_INSERT_ORDER) {
      counts[tableName] = (fixtureData[tableName] || []).length;
    }
    return { seed, counts };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seedValue = Number.parseInt(args.seed, 10);
  const seed = Number.isFinite(seedValue) ? seedValue : DEFAULT_SEED;
  const result = await seedFixtures({ seed });
  console.log(`Fixture seeding complete (seed=${result.seed}).`);
  console.log(`Inserted rows: ${JSON.stringify(result.counts, null, 2)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("db-seed-fixtures failed:", err.message || err);
    process.exit(1);
  });
}

module.exports = {
  buildFixtureData,
  parseArgs,
  seedFixtures,
};
