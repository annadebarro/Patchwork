"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.addColumn(
        "posts",
        "category",
        {
          type: Sequelize.TEXT,
          allowNull: false,
          defaultValue: "unknown",
        },
        queryOptions
      );

      await queryInterface.addColumn(
        "posts",
        "subcategory",
        {
          type: Sequelize.TEXT,
          allowNull: false,
          defaultValue: "unknown",
        },
        queryOptions
      );

      await queryInterface.addColumn(
        "posts",
        "brand",
        {
          type: Sequelize.TEXT,
          allowNull: false,
          defaultValue: "",
        },
        queryOptions
      );

      await queryInterface.addColumn(
        "posts",
        "style_tags",
        {
          type: Sequelize.ARRAY(Sequelize.TEXT),
          allowNull: false,
          defaultValue: Sequelize.literal("ARRAY[]::TEXT[]"),
        },
        queryOptions
      );

      await queryInterface.addColumn(
        "posts",
        "color_tags",
        {
          type: Sequelize.ARRAY(Sequelize.TEXT),
          allowNull: false,
          defaultValue: Sequelize.literal("ARRAY[]::TEXT[]"),
        },
        queryOptions
      );

      await queryInterface.addColumn(
        "posts",
        "condition",
        {
          type: Sequelize.TEXT,
          allowNull: false,
          defaultValue: "unknown",
        },
        queryOptions
      );

      await queryInterface.addColumn(
        "posts",
        "size_label",
        {
          type: Sequelize.TEXT,
          allowNull: false,
          defaultValue: "unknown",
        },
        queryOptions
      );

      await queryInterface.sequelize.query(
        `UPDATE "posts"
         SET "category" = COALESCE("category", 'unknown'),
             "subcategory" = COALESCE("subcategory", 'unknown'),
             "brand" = COALESCE("brand", ''),
             "style_tags" = COALESCE("style_tags", ARRAY[]::TEXT[]),
             "color_tags" = COALESCE("color_tags", ARRAY[]::TEXT[]),
             "condition" = COALESCE("condition", 'unknown'),
             "size_label" = COALESCE("size_label", 'unknown');`,
        queryOptions
      );

      await queryInterface.addIndex(
        "posts",
        ["category", "subcategory", "condition", "size_label"],
        {
          name: "posts_category_subcategory_condition_size_label_idx",
          transaction,
        }
      );

      await queryInterface.addIndex("posts", ["style_tags"], {
        name: "posts_style_tags_gin_idx",
        using: "gin",
        transaction,
      });

      await queryInterface.addIndex("posts", ["color_tags"], {
        name: "posts_color_tags_gin_idx",
        using: "gin",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.removeIndex("posts", "posts_color_tags_gin_idx", queryOptions);
      await queryInterface.removeIndex("posts", "posts_style_tags_gin_idx", queryOptions);
      await queryInterface.removeIndex(
        "posts",
        "posts_category_subcategory_condition_size_label_idx",
        queryOptions
      );

      await queryInterface.removeColumn("posts", "size_label", queryOptions);
      await queryInterface.removeColumn("posts", "condition", queryOptions);
      await queryInterface.removeColumn("posts", "color_tags", queryOptions);
      await queryInterface.removeColumn("posts", "style_tags", queryOptions);
      await queryInterface.removeColumn("posts", "brand", queryOptions);
      await queryInterface.removeColumn("posts", "subcategory", queryOptions);
      await queryInterface.removeColumn("posts", "category", queryOptions);
    });
  },
};
