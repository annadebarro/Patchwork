"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.sequelize.query(
        `
          ALTER TABLE "user_actions"
            ADD COLUMN IF NOT EXISTS "target_type" VARCHAR,
            ADD COLUMN IF NOT EXISTS "metadata_json" JSONB,
            ADD COLUMN IF NOT EXISTS "source_surface" VARCHAR,
            ADD COLUMN IF NOT EXISTS "occurred_at" TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS "session_id" UUID;
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          UPDATE "user_actions"
          SET "target_type" = 'unknown'
          WHERE "target_type" IS NULL;
        `,
        queryOptions
      );
      await queryInterface.sequelize.query(
        `
          UPDATE "user_actions"
          SET "metadata_json" = '{}'::jsonb
          WHERE "metadata_json" IS NULL;
        `,
        queryOptions
      );
      await queryInterface.sequelize.query(
        `
          UPDATE "user_actions"
          SET "source_surface" = 'unknown'
          WHERE "source_surface" IS NULL;
        `,
        queryOptions
      );
      await queryInterface.sequelize.query(
        `
          UPDATE "user_actions"
          SET "occurred_at" = COALESCE("created_at", CURRENT_TIMESTAMP)
          WHERE "occurred_at" IS NULL;
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          ALTER TABLE "user_actions"
            ALTER COLUMN "target_type" SET DEFAULT 'unknown',
            ALTER COLUMN "target_type" SET NOT NULL,
            ALTER COLUMN "metadata_json" SET DEFAULT '{}'::jsonb,
            ALTER COLUMN "metadata_json" SET NOT NULL,
            ALTER COLUMN "source_surface" SET DEFAULT 'unknown',
            ALTER COLUMN "source_surface" SET NOT NULL,
            ALTER COLUMN "occurred_at" SET DEFAULT CURRENT_TIMESTAMP,
            ALTER COLUMN "occurred_at" SET NOT NULL;
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "user_actions_user_id_occurred_at_idx"
          ON "user_actions" ("user_id", "occurred_at" DESC);
        `,
        queryOptions
      );
      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "user_actions_action_type_occurred_at_idx"
          ON "user_actions" ("action_type", "occurred_at" DESC);
        `,
        queryOptions
      );
      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "user_actions_target_type_target_id_idx"
          ON "user_actions" ("target_type", "target_id");
        `,
        queryOptions
      );
      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "user_actions_source_surface_occurred_at_idx"
          ON "user_actions" ("source_surface", "occurred_at" DESC);
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
          DROP INDEX IF EXISTS "user_actions_source_surface_occurred_at_idx";
          DROP INDEX IF EXISTS "user_actions_target_type_target_id_idx";
          DROP INDEX IF EXISTS "user_actions_action_type_occurred_at_idx";
          DROP INDEX IF EXISTS "user_actions_user_id_occurred_at_idx";
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          ALTER TABLE "user_actions"
            DROP COLUMN IF EXISTS "session_id",
            DROP COLUMN IF EXISTS "occurred_at",
            DROP COLUMN IF EXISTS "source_surface",
            DROP COLUMN IF EXISTS "metadata_json",
            DROP COLUMN IF EXISTS "target_type";
        `,
        queryOptions
      );
    });
  },
};
