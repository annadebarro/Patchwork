const { DataTypes } = require("sequelize");

let models;

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
          fields: ["followerId", "followeeId"],
        },
        {
          fields: ["followerId"],
        },
        {
          fields: ["followeeId"],
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
          fields: ["conversationId", "userId"],
        },
        {
          fields: ["userId"],
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
          fields: ["conversationId", "createdAt"],
        },
        {
          fields: ["senderId"],
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
          fields: ["userId"],
        },
        {
          fields: ["actionType"],
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

  models = {
    User,
    Follow,
    Conversation,
    ConversationParticipant,
    Message,
    UserAction,
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
