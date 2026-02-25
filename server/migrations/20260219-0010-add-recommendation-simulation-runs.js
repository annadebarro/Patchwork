"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "recommendation_simulation_runs",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          mode: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          params_json: {
            type: Sequelize.JSONB,
            allowNull: false,
          },
          result_summary_json: {
            type: Sequelize.JSONB,
            allowNull: false,
          },
          candidate_config_json: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          created_by: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
        },
        { transaction }
      );

      await queryInterface.addIndex("recommendation_simulation_runs", ["created_at"], {
        name: "recommendation_simulation_runs_created_at_idx",
        transaction,
      });

      await queryInterface.addIndex("recommendation_simulation_runs", ["mode", "created_at"], {
        name: "recommendation_simulation_runs_mode_created_at_idx",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex(
        "recommendation_simulation_runs",
        "recommendation_simulation_runs_mode_created_at_idx",
        { transaction }
      );
      await queryInterface.removeIndex(
        "recommendation_simulation_runs",
        "recommendation_simulation_runs_created_at_idx",
        { transaction }
      );
      await queryInterface.dropTable("recommendation_simulation_runs", { transaction });
    });
  },
};
