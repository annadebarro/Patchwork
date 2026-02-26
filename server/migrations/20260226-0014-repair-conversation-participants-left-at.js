"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
          ALTER TABLE "conversation_participants"
          ADD COLUMN IF NOT EXISTS "left_at" TIMESTAMPTZ NULL;
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
