"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.addColumn(
        "posts",
        "image_urls",
        {
          type: Sequelize.ARRAY(Sequelize.TEXT),
          allowNull: false,
          defaultValue: Sequelize.literal("ARRAY[]::TEXT[]"),
        },
        queryOptions
      );

      // Backfill: copy existing image_url into the new array column
      await queryInterface.sequelize.query(
        `UPDATE "posts" SET "image_urls" = ARRAY["image_url"] WHERE "image_url" IS NOT NULL AND array_length("image_urls", 1) IS NULL;`,
        queryOptions
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("posts", "image_urls", { transaction });
    });
  },
};
