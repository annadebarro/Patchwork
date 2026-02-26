"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
          ALTER TABLE "conversations"
            ADD COLUMN IF NOT EXISTS "linked_post_id" UUID REFERENCES "posts"("id") ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS "deal_status" TEXT DEFAULT NULL;
        `,
        { transaction }
      );
    });
  },

  async down() {
    // Intentionally non-destructive.
    return Promise.resolve();
  },
};
