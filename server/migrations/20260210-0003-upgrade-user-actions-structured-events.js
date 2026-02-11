"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.addColumn(
        "user_actions",
        "target_type",
        {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "unknown",
        },
        queryOptions
      );

      await queryInterface.addColumn(
        "user_actions",
        "metadata_json",
        {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        queryOptions
      );

      await queryInterface.addColumn(
        "user_actions",
        "source_surface",
        {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "unknown",
        },
        queryOptions
      );

      await queryInterface.addColumn(
        "user_actions",
        "occurred_at",
        {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        queryOptions
      );

      await queryInterface.addColumn(
        "user_actions",
        "session_id",
        {
          type: Sequelize.UUID,
          allowNull: true,
        },
        queryOptions
      );

      await queryInterface.sequelize.query(
        `UPDATE "user_actions"
         SET "occurred_at" = COALESCE("created_at", CURRENT_TIMESTAMP)
         WHERE "occurred_at" IS NULL;`,
        queryOptions
      );

      await queryInterface.addIndex("user_actions", {
        name: "user_actions_user_id_occurred_at_idx",
        fields: ["user_id", { name: "occurred_at", order: "DESC" }],
        transaction,
      });

      await queryInterface.addIndex("user_actions", {
        name: "user_actions_action_type_occurred_at_idx",
        fields: ["action_type", { name: "occurred_at", order: "DESC" }],
        transaction,
      });

      await queryInterface.addIndex("user_actions", {
        name: "user_actions_target_type_target_id_idx",
        fields: ["target_type", "target_id"],
        transaction,
      });

      await queryInterface.addIndex("user_actions", {
        name: "user_actions_source_surface_occurred_at_idx",
        fields: ["source_surface", { name: "occurred_at", order: "DESC" }],
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const queryOptions = { transaction };

      await queryInterface.removeIndex(
        "user_actions",
        "user_actions_source_surface_occurred_at_idx",
        queryOptions
      );
      await queryInterface.removeIndex(
        "user_actions",
        "user_actions_target_type_target_id_idx",
        queryOptions
      );
      await queryInterface.removeIndex(
        "user_actions",
        "user_actions_action_type_occurred_at_idx",
        queryOptions
      );
      await queryInterface.removeIndex(
        "user_actions",
        "user_actions_user_id_occurred_at_idx",
        queryOptions
      );

      await queryInterface.removeColumn("user_actions", "session_id", queryOptions);
      await queryInterface.removeColumn("user_actions", "occurred_at", queryOptions);
      await queryInterface.removeColumn("user_actions", "source_surface", queryOptions);
      await queryInterface.removeColumn("user_actions", "metadata_json", queryOptions);
      await queryInterface.removeColumn("user_actions", "target_type", queryOptions);
    });
  },
};
