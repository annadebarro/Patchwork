"use strict";

const { randomUUID } = require("crypto");

const DEFAULT_CONFIG_JSON = {
  version: "hybrid_v1",
  regularWeights: {
    followAff: 1.8,
    authorAff: 1.2,
    styleMatch: 1.0,
    colorMatch: 0.6,
    brandMatch: 0.6,
    engagementVelocity: 0.9,
    freshness: 0.8,
  },
  marketWeights: {
    followAff: 1.6,
    authorAff: 1.0,
    categoryMatch: 1.0,
    brandMatch: 0.8,
    sizeMatch: 0.9,
    priceBandMatch: 0.8,
    conditionMatch: 0.7,
    engagementVelocity: 0.8,
    freshness: 0.7,
  },
  freshnessHalfLifeDays: {
    regular: 7,
    market: 14,
  },
  blend: {
    defaultMarketShare: 0.4,
    minMarketShare: 0.2,
    maxMarketShare: 0.8,
    minActionsForLearnedShare: 10,
  },
  diversityCaps: [
    { maxRankExclusive: 20, maxPerAuthor: 2 },
    { maxRankExclusive: 30, maxPerAuthor: 3 },
  ],
  pools: {
    defaultLimitPerType: 250,
    regularRecencyDays: 180,
    marketRecencyDays: 365,
    engagementWindowDays: 30,
    preferenceWindowDays: 90,
  },
  actionSignalWeights: {
    user_follow: 3,
    post_patch_save: 3,
    post_like: 2,
    comment_create: 2,
    comment_like: 1,
    user_unfollow: -3,
    post_unlike: -2,
    comment_unlike: -1,
    feed_click: 0.5,
    feed_dwell: 0.25,
  },
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "recommendation_configs",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          version: {
            type: Sequelize.BIGINT,
            allowNull: false,
            autoIncrement: true,
            unique: true,
          },
          scope: {
            type: Sequelize.TEXT,
            allowNull: false,
            defaultValue: "hybrid_v1",
          },
          config_json: {
            type: Sequelize.JSONB,
            allowNull: false,
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          created_by: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          source: {
            type: Sequelize.TEXT,
            allowNull: false,
            defaultValue: "manual",
          },
          source_run_id: {
            type: Sequelize.UUID,
            allowNull: true,
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
        },
        { transaction }
      );

      await queryInterface.addIndex("recommendation_configs", ["scope", "is_active"], {
        name: "recommendation_configs_scope_active_idx",
        transaction,
      });

      await queryInterface.sequelize.query(
        `
          CREATE UNIQUE INDEX recommendation_configs_active_scope_unique_idx
          ON recommendation_configs (scope)
          WHERE is_active = TRUE;
        `,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `
          INSERT INTO recommendation_configs (
            id,
            scope,
            config_json,
            is_active,
            source,
            notes,
            created_at,
            updated_at
          )
          VALUES (
            :id,
            'hybrid_v1',
            CAST(:configJson AS JSONB),
            TRUE,
            'manual',
            'Initial default hybrid_v1 config',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          );
        `,
        {
          transaction,
          replacements: {
            id: randomUUID(),
            configJson: JSON.stringify(DEFAULT_CONFIG_JSON),
          },
        }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex(
        "recommendation_configs",
        "recommendation_configs_scope_active_idx",
        { transaction }
      );

      await queryInterface.sequelize.query(
        `
          DROP INDEX IF EXISTS recommendation_configs_active_scope_unique_idx;
        `,
        { transaction }
      );

      await queryInterface.dropTable("recommendation_configs", { transaction });
    });
  },
};
