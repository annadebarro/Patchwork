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
        allowNull: false,
        field: "image_url",
      },
      priceCents: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "price_cents",
      },
      isPublic: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: "is_public",
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

  models = {
    User,
    Follow,
    Conversation,
    ConversationParticipant,
    Message,
    UserAction,
    Post,
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
