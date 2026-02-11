"use strict";

const DEFAULT_SIZE_PREFERENCES_JSON =
  '{"tops":[],"bottoms":[],"dresses":[],"outerwear":[],"shoes":[]}';

function timestamps(Sequelize) {
  return {
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  };
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "users",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          email: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true,
          },
          username: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true,
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          bio: {
            type: Sequelize.TEXT,
            allowNull: true,
            defaultValue: "",
          },
          size_preferences: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: Sequelize.literal(`'${DEFAULT_SIZE_PREFERENCES_JSON}'::jsonb`),
          },
          favorite_brands: {
            type: Sequelize.ARRAY(Sequelize.STRING),
            allowNull: false,
            defaultValue: Sequelize.literal("ARRAY[]::TEXT[]"),
          },
          onboarding_status: {
            type: Sequelize.ENUM("pending", "completed", "skipped"),
            allowNull: false,
            defaultValue: "pending",
          },
          onboarding_prompt_seen: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          profile_picture: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          password_hash: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.createTable(
        "conversations",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.createTable(
        "posts",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          type: {
            type: Sequelize.ENUM("regular", "market"),
            allowNull: false,
            defaultValue: "regular",
          },
          caption: {
            type: Sequelize.TEXT,
            allowNull: true,
            defaultValue: "",
          },
          image_url: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          price_cents: {
            type: Sequelize.INTEGER,
            allowNull: true,
          },
          is_public: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          is_sold: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.createTable(
        "follows",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          follower_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          followee_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.createTable(
        "conversation_participants",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          conversation_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "conversations", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.createTable(
        "messages",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          conversation_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "conversations", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          sender_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          body: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.createTable(
        "user_actions",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          action_type: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          target_id: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.createTable(
        "likes",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          post_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "posts", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.createTable(
        "comments",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          post_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "posts", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          body: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          parent_id: {
            type: Sequelize.UUID,
            allowNull: true,
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.addConstraint("comments", {
        type: "foreign key",
        fields: ["parent_id"],
        references: { table: "comments", field: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        transaction,
      });

      await queryInterface.createTable(
        "quilts",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
            defaultValue: "",
          },
          is_public: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.createTable(
        "patches",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          quilt_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "quilts", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          post_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "posts", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.createTable(
        "comment_likes",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          comment_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "comments", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.createTable(
        "notifications",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          actor_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          type: {
            type: Sequelize.ENUM(
              "like",
              "comment",
              "follow",
              "patch",
              "mention",
              "comment_like",
              "message"
            ),
            allowNull: false,
          },
          post_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "posts", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          read: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          ...timestamps(Sequelize),
        },
        { transaction }
      );

      await queryInterface.addIndex("follows", ["follower_id", "followee_id"], {
        unique: true,
        transaction,
      });
      await queryInterface.addIndex("follows", ["follower_id"], { transaction });
      await queryInterface.addIndex("follows", ["followee_id"], { transaction });

      await queryInterface.addIndex("conversation_participants", ["conversation_id", "user_id"], {
        unique: true,
        transaction,
      });
      await queryInterface.addIndex("conversation_participants", ["user_id"], { transaction });

      await queryInterface.addIndex("messages", ["conversation_id", "created_at"], { transaction });
      await queryInterface.addIndex("messages", ["sender_id"], { transaction });

      await queryInterface.addIndex("user_actions", ["user_id"], { transaction });
      await queryInterface.addIndex("user_actions", ["action_type"], { transaction });

      await queryInterface.addIndex("likes", ["user_id", "post_id"], {
        unique: true,
        transaction,
      });

      await queryInterface.addIndex("comments", ["post_id", "created_at"], { transaction });

      await queryInterface.addIndex("patches", ["quilt_id", "post_id"], {
        unique: true,
        transaction,
      });

      await queryInterface.addIndex("comment_likes", ["user_id", "comment_id"], {
        unique: true,
        transaction,
      });

      await queryInterface.addIndex("notifications", ["user_id", "read", "created_at"], {
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("notifications", { transaction });
      await queryInterface.dropTable("comment_likes", { transaction });
      await queryInterface.dropTable("patches", { transaction });
      await queryInterface.dropTable("quilts", { transaction });
      await queryInterface.dropTable("comments", { transaction });
      await queryInterface.dropTable("likes", { transaction });
      await queryInterface.dropTable("user_actions", { transaction });
      await queryInterface.dropTable("messages", { transaction });
      await queryInterface.dropTable("conversation_participants", { transaction });
      await queryInterface.dropTable("follows", { transaction });
      await queryInterface.dropTable("posts", { transaction });
      await queryInterface.dropTable("conversations", { transaction });
      await queryInterface.dropTable("users", { transaction });

      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_notifications_type";', {
        transaction,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_posts_type";', {
        transaction,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_onboarding_status";', {
        transaction,
      });
    });
  },
};
