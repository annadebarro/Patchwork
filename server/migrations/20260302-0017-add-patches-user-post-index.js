"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
          CREATE INDEX IF NOT EXISTS "patches_user_post_idx"
          ON "patches" ("user_id", "post_id");
        `,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
          DROP INDEX IF EXISTS "patches_user_post_idx";
        `,
        { transaction }
      );
    });
  },
};
