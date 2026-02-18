"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      // Add columns to conversations table
      await queryInterface.sequelize.query(
        `
          ALTER TABLE "conversations"
            ADD COLUMN IF NOT EXISTS "linked_post_id" UUID REFERENCES "posts"("id") ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS "deal_status" TEXT DEFAULT NULL;
        `,
        queryOptions
      );

      // Create ratings table
      await queryInterface.sequelize.query(
        `
          CREATE TABLE IF NOT EXISTS "ratings" (
            "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "rater_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
            "ratee_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
            "conversation_id" UUID NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
            "score" INTEGER NOT NULL CHECK ("score" >= 1 AND "score" <= 5),
            "review" TEXT,
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
        `,
        queryOptions
      );

      // Unique index: one rating per rater per conversation
      await queryInterface.sequelize.query(
        `
          CREATE UNIQUE INDEX IF NOT EXISTS "ratings_rater_conversation_unique"
          ON "ratings" ("rater_id", "conversation_id");
        `,
        queryOptions
      );

      // Index for profile lookups
      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "ratings_ratee_id_idx"
          ON "ratings" ("ratee_id");
        `,
        queryOptions
      );

      // Add 'rating' to the notification type enum
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_notifications_type" ADD VALUE IF NOT EXISTS 'rating';`,
        queryOptions
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.sequelize.query(
        `
          DROP INDEX IF EXISTS "ratings_ratee_id_idx";
          DROP INDEX IF EXISTS "ratings_rater_conversation_unique";
          DROP TABLE IF EXISTS "ratings";
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          ALTER TABLE "conversations"
            DROP COLUMN IF EXISTS "deal_status",
            DROP COLUMN IF EXISTS "linked_post_id";
        `,
        queryOptions
      );
    });
  },
};
