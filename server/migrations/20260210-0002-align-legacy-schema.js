"use strict";

const DEFAULT_SIZE_PREFERENCES_JSON =
  '{"tops":[],"bottoms":[],"dresses":[],"outerwear":[],"shoes":[]}';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.sequelize.query(
        `DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_type
              WHERE typname = 'enum_users_onboarding_status'
            ) THEN
              CREATE TYPE "enum_users_onboarding_status" AS ENUM ('pending', 'completed', 'skipped');
            END IF;
          END
        $$;`,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "users"
          ADD COLUMN IF NOT EXISTS "size_preferences" JSONB DEFAULT '${DEFAULT_SIZE_PREFERENCES_JSON}'::jsonb;`,
        queryOptions
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "favorite_brands" TEXT[] DEFAULT ARRAY[]::TEXT[];',
        queryOptions
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "users"
          ADD COLUMN IF NOT EXISTS "onboarding_status" "enum_users_onboarding_status" DEFAULT 'pending';`,
        queryOptions
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_prompt_seen" BOOLEAN DEFAULT false;',
        queryOptions
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_picture" TEXT;',
        queryOptions
      );

      await queryInterface.sequelize.query(
        `UPDATE "users"
          SET "size_preferences" = '${DEFAULT_SIZE_PREFERENCES_JSON}'::jsonb
          WHERE "size_preferences" IS NULL;`,
        queryOptions
      );
      await queryInterface.sequelize.query(
        'UPDATE "users" SET "favorite_brands" = ARRAY[]::TEXT[] WHERE "favorite_brands" IS NULL;',
        queryOptions
      );
      await queryInterface.sequelize.query(
        `UPDATE "users"
          SET "onboarding_status" = 'pending'
          WHERE "onboarding_status" IS NULL;`,
        queryOptions
      );
      await queryInterface.sequelize.query(
        'UPDATE "users" SET "onboarding_prompt_seen" = false WHERE "onboarding_prompt_seen" IS NULL;',
        queryOptions
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "users"
          ALTER COLUMN "size_preferences" SET DEFAULT '${DEFAULT_SIZE_PREFERENCES_JSON}'::jsonb,
          ALTER COLUMN "size_preferences" SET NOT NULL;`,
        queryOptions
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "users"
          ALTER COLUMN "favorite_brands" SET DEFAULT ARRAY[]::TEXT[],
          ALTER COLUMN "favorite_brands" SET NOT NULL;`,
        queryOptions
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "users"
          ALTER COLUMN "onboarding_status" SET DEFAULT 'pending',
          ALTER COLUMN "onboarding_status" SET NOT NULL;`,
        queryOptions
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "users"
          ALTER COLUMN "onboarding_prompt_seen" SET DEFAULT false,
          ALTER COLUMN "onboarding_prompt_seen" SET NOT NULL;`,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_notifications_type') THEN
              BEGIN
                ALTER TYPE "enum_notifications_type" ADD VALUE IF NOT EXISTS 'message';
              EXCEPTION WHEN duplicate_object THEN NULL;
              END;
            END IF;
          END
        $$;`,
        queryOptions
      );
    });
  },

  async down() {
    // Intentionally non-destructive: this migration aligns legacy schema safely and is not reversed.
  },
};
