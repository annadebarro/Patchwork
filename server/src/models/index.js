const { DataTypes } = require("sequelize");

let models;

function createDefaultSizePreferences() {
  return {
    tops: [],
    bottoms: [],
    dresses: [],
    outerwear: [],
    shoes: [],
  };
}

function initModels(sequelize) {
  if (models) return models;

  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      bio: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: "",
      },
      sizePreferences: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: createDefaultSizePreferences,
        field: "size_preferences",
      },
      favoriteBrands: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
        field: "favorite_brands",
      },
      onboardingStatus: {
        type: DataTypes.ENUM("pending", "completed", "skipped"),
        allowNull: false,
        defaultValue: "pending",
        field: "onboarding_status",
      },
      onboardingPromptSeen: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "onboarding_prompt_seen",
      },
      profilePicture: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "profile_picture",
      },
      role: {
        type: DataTypes.ENUM("user", "admin"),
        allowNull: false,
        defaultValue: "user",
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "password_hash",
      },
    },
    {
      tableName: "users",
      timestamps: true,
      underscored: true,
    }
  );

  const Follow = sequelize.define(
    "Follow",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      followerId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "follower_id",
      },
      followeeId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "followee_id",
      },
    },
    {
      tableName: "follows",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["follower_id", "followee_id"],
        },
        {
          fields: ["follower_id"],
        },
        {
          fields: ["followee_id"],
        },
      ],
    }
  );

  const Conversation = sequelize.define(
    "Conversation",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
    },
    {
      tableName: "conversations",
      timestamps: true,
      underscored: true,
    }
  );

  const ConversationParticipant = sequelize.define(
    "ConversationParticipant",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      conversationId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "conversation_id",
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
    },
    {
      tableName: "conversation_participants",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["conversation_id", "user_id"],
        },
        {
          fields: ["user_id"],
        },
      ],
    }
  );

  const Message = sequelize.define(
    "Message",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      conversationId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "conversation_id",
      },
      senderId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "sender_id",
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      tableName: "messages",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ["conversation_id", "created_at"],
        },
        {
          fields: ["sender_id"],
        },
      ],
    }
  );

  const UserAction = sequelize.define(
    "UserAction",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
      actionType: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "action_type",
      },
      targetId: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "target_id",
      },
      targetType: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "unknown",
        field: "target_type",
      },
      metadataJson: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
        field: "metadata_json",
      },
      sourceSurface: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "unknown",
        field: "source_surface",
      },
      occurredAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "occurred_at",
      },
      sessionId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: "session_id",
      },
    },
    {
      tableName: "user_actions",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ["user_id"],
        },
        {
          fields: ["action_type"],
        },
        {
          fields: ["user_id", { name: "occurred_at", order: "DESC" }],
        },
        {
          fields: ["action_type", { name: "occurred_at", order: "DESC" }],
        },
        {
          fields: ["target_type", "target_id"],
        },
        {
          fields: ["source_surface", { name: "occurred_at", order: "DESC" }],
        },
      ],
    }
  );

  User.hasMany(Follow, { foreignKey: "followerId", as: "following" });
  User.hasMany(Follow, { foreignKey: "followeeId", as: "followers" });
  Follow.belongsTo(User, { foreignKey: "followerId", as: "follower" });
  Follow.belongsTo(User, { foreignKey: "followeeId", as: "followee" });

  Conversation.hasMany(ConversationParticipant, {
    foreignKey: "conversationId",
    as: "participants",
  });
  ConversationParticipant.belongsTo(Conversation, {
    foreignKey: "conversationId",
  });
  ConversationParticipant.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });
  User.hasMany(ConversationParticipant, {
    foreignKey: "userId",
    as: "conversations",
  });

  Conversation.hasMany(Message, {
    foreignKey: "conversationId",
    as: "messages",
  });
  Message.belongsTo(Conversation, { foreignKey: "conversationId" });
  Message.belongsTo(User, { foreignKey: "senderId", as: "sender" });
  User.hasMany(Message, { foreignKey: "senderId", as: "sentMessages" });

  User.hasMany(UserAction, { foreignKey: "userId", as: "actions" });
  UserAction.belongsTo(User, { foreignKey: "userId", as: "user" });

  const Post = sequelize.define(
    "Post",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
      type: {
        type: DataTypes.ENUM("regular", "market"),
        allowNull: false,
        defaultValue: "regular",
      },
      caption: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: "",
      },
      imageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "image_url",
      },
      imageUrls: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: false,
        defaultValue: [],
        field: "image_urls",
      },
      priceCents: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "price_cents",
      },
      category: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: "unknown",
      },
      subcategory: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: "unknown",
      },
      brand: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: "",
      },
      styleTags: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
        field: "style_tags",
      },
      colorTags: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
        field: "color_tags",
      },
      condition: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: "unknown",
      },
      sizeLabel: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: "unknown",
        field: "size_label",
      },
      isPublic: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: "is_public",
      },
      isSold: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "is_sold",
      },
    },
    {
      tableName: "posts",
      timestamps: true,
      underscored: true,
    }
  );

  User.hasMany(Post, { foreignKey: "userId", as: "posts" });
  Post.belongsTo(User, { foreignKey: "userId", as: "author" });

  const Like = sequelize.define(
    "Like",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
      postId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "post_id",
      },
    },
    {
      tableName: "likes",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["user_id", "post_id"],
        },
      ],
    }
  );

  const Comment = sequelize.define(
    "Comment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
      postId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "post_id",
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      parentId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: "parent_id",
      },
    },
    {
      tableName: "comments",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ["post_id", "created_at"],
        },
      ],
    }
  );

  const Quilt = sequelize.define(
    "Quilt",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: "",
      },
      isPublic: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "is_public",
      },
    },
    {
      tableName: "quilts",
      timestamps: true,
      underscored: true,
    }
  );

  const Patch = sequelize.define(
    "Patch",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      quiltId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "quilt_id",
      },
      postId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "post_id",
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
    },
    {
      tableName: "patches",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["quilt_id", "post_id"],
        },
      ],
    }
  );

  const CommentLike = sequelize.define(
    "CommentLike",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
      commentId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "comment_id",
      },
    },
    {
      tableName: "comment_likes",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["user_id", "comment_id"],
        },
      ],
    }
  );

  const Notification = sequelize.define(
    "Notification",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
      actorId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "actor_id",
      },
      type: {
        type: DataTypes.ENUM("like", "comment", "follow", "patch", "mention", "comment_like", "message"),
        allowNull: false,
      },
      postId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: "post_id",
      },
      read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: "notifications",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ["user_id", "read", "created_at"],
        },
      ],
    }
  );

  User.hasMany(Notification, { foreignKey: "userId", as: "notifications" });
  Notification.belongsTo(User, { foreignKey: "actorId", as: "actor" });
  Notification.belongsTo(Post, { foreignKey: "postId", as: "post" });

  User.hasMany(Like, { foreignKey: "userId", as: "likes" });
  Like.belongsTo(User, { foreignKey: "userId", as: "user" });
  Post.hasMany(Like, { foreignKey: "postId", as: "likes" });
  Like.belongsTo(Post, { foreignKey: "postId", as: "post" });

  User.hasMany(Comment, { foreignKey: "userId", as: "comments" });
  Comment.belongsTo(User, { foreignKey: "userId", as: "author" });
  Post.hasMany(Comment, { foreignKey: "postId", as: "comments" });
  Comment.belongsTo(Post, { foreignKey: "postId", as: "post" });
  Comment.hasMany(Comment, { foreignKey: "parentId", as: "replies", onDelete: "CASCADE", hooks: true });
  Comment.belongsTo(Comment, { foreignKey: "parentId", as: "parent" });

  User.hasMany(CommentLike, { foreignKey: "userId", as: "commentLikes" });
  CommentLike.belongsTo(User, { foreignKey: "userId", as: "user" });
  Comment.hasMany(CommentLike, { foreignKey: "commentId", as: "commentLikes" });
  CommentLike.belongsTo(Comment, { foreignKey: "commentId", as: "comment" });

  User.hasMany(Quilt, { foreignKey: "userId", as: "quilts" });
  Quilt.belongsTo(User, { foreignKey: "userId", as: "owner" });

  Quilt.hasMany(Patch, { foreignKey: "quiltId", as: "patches" });
  Patch.belongsTo(Quilt, { foreignKey: "quiltId", as: "quilt" });
  Post.hasMany(Patch, { foreignKey: "postId", as: "patches" });
  Patch.belongsTo(Post, { foreignKey: "postId", as: "post" });
  User.hasMany(Patch, { foreignKey: "userId", as: "patchesMade" });
  Patch.belongsTo(User, { foreignKey: "userId", as: "user" });

  models = {
    User,
    Follow,
    Conversation,
    ConversationParticipant,
    Message,
    UserAction,
    Post,
    Like,
    Comment,
    CommentLike,
    Quilt,
    Patch,
    Notification,
  };

  return models;
}

function getModels() {
  if (!models) {
    throw new Error("Models have not been initialized");
  }
  return models;
}

module.exports = { initModels, getModels };
