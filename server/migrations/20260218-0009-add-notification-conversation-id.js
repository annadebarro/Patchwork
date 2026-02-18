"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.sequelize.query(
        `
          ALTER TABLE "notifications"
            ADD COLUMN IF NOT EXISTS "conversation_id" UUID REFERENCES "conversations"("id") ON DELETE SET NULL;
        `,
        queryOptions
      );

      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_notifications_type" ADD VALUE IF NOT EXISTS 'deal_complete';`,
        queryOptions
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.sequelize.query(
        `
          ALTER TABLE "notifications"
            DROP COLUMN IF EXISTS "conversation_id";
        `,
        queryOptions
      );
    });
  },
};
