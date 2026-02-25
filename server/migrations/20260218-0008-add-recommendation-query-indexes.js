"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "posts_public_type_sold_created_user_idx"
          ON "posts" ("is_public", "type", "is_sold", "created_at" DESC, "user_id");
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "likes_post_created_at_idx"
          ON "likes" ("post_id", "created_at" DESC);
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "comments_post_created_at_idx"
          ON "comments" ("post_id", "created_at" DESC);
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "patches_post_created_at_idx"
          ON "patches" ("post_id", "created_at" DESC);
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "follows_follower_followee_idx"
          ON "follows" ("follower_id", "followee_id");
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "user_actions_user_action_occurred_target_idx"
          ON "user_actions" ("user_id", "action_type", "occurred_at" DESC, "target_type", "target_id");
        `,
        queryOptions
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.sequelize.query(
        `
          DROP INDEX IF EXISTS "user_actions_user_action_occurred_target_idx";
          DROP INDEX IF EXISTS "follows_follower_followee_idx";
          DROP INDEX IF EXISTS "patches_post_created_at_idx";
          DROP INDEX IF EXISTS "comments_post_created_at_idx";
          DROP INDEX IF EXISTS "likes_post_created_at_idx";
          DROP INDEX IF EXISTS "posts_public_type_sold_created_user_idx";
        `,
        queryOptions
      );
    });
  },
};
