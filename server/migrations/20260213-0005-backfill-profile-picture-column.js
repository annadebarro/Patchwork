"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };
      const userColumns = await queryInterface.describeTable("users", queryOptions);

      const hasProfilePicture = Object.prototype.hasOwnProperty.call(userColumns, "profile_picture");
      const hasAvatarUrl = Object.prototype.hasOwnProperty.call(userColumns, "avatar_url");

      if (!hasProfilePicture) {
        await queryInterface.sequelize.query(
          'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_picture" TEXT;',
          queryOptions
        );
      }

      if (hasAvatarUrl) {
        await queryInterface.sequelize.query(
          `UPDATE "users"
            SET "profile_picture" = COALESCE("profile_picture", "avatar_url")
            WHERE "avatar_url" IS NOT NULL;`,
          queryOptions
        );
      }
    });
  },

  async down() {
    // Intentionally non-destructive.
  },
};
