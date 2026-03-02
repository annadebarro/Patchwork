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
          SET "target_type" = COALESCE("target_type", 'unknown'),
              "metadata_json" = COALESCE("metadata_json", '{}'::jsonb),
              "source_surface" = COALESCE("source_surface", 'unknown'),
              "occurred_at" = COALESCE("occurred_at", "created_at", CURRENT_TIMESTAMP);
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

      await queryInterface.sequelize.query(
        `
          ALTER TABLE "conversation_participants"
          ADD COLUMN IF NOT EXISTS "left_at" TIMESTAMPTZ NULL;
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "conversation_participants_user_id_left_at_idx"
          ON "conversation_participants" ("user_id", "left_at");
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `
          ALTER TABLE "conversations"
            ADD COLUMN IF NOT EXISTS "linked_post_id" UUID REFERENCES "posts"("id") ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS "deal_status" TEXT DEFAULT NULL;
        `,
        queryOptions
      );
    });
  },

  async down() {
    return Promise.resolve();
  },
};
