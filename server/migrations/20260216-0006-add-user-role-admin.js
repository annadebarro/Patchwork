"use strict";

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
              WHERE typname = 'enum_users_role'
            ) THEN
              CREATE TYPE "enum_users_role" AS ENUM ('user', 'admin');
            END IF;
          END
        $$;`,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "users"
          ADD COLUMN IF NOT EXISTS "role" "enum_users_role" DEFAULT 'user';`,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `UPDATE "users"
          SET "role" = 'user'
          WHERE "role" IS NULL;`,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "users"
          ALTER COLUMN "role" SET DEFAULT 'user',
          ALTER COLUMN "role" SET NOT NULL;`,
        queryOptions
      );

      await queryInterface.addIndex("users", ["role"], {
        name: "users_role_idx",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.removeIndex("users", "users_role_idx", queryOptions);
      await queryInterface.removeColumn("users", "role", queryOptions);

      await queryInterface.sequelize.query(
        `DO $$
          BEGIN
            IF EXISTS (
              SELECT 1
              FROM pg_type
              WHERE typname = 'enum_users_role'
            ) THEN
              DROP TYPE "enum_users_role";
            END IF;
          END
        $$;`,
        queryOptions
      );
    });
  },
};
