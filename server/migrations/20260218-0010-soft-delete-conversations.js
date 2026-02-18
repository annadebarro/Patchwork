"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      // Add left_at to conversation_participants for soft-delete per user.
      // When a user "deletes" a conversation, left_at is set to NOW().
      // The row is kept so the other participant can still see the other
      // person's username/profile pic via the participant join.
      await queryInterface.addColumn(
        "conversation_participants",
        "left_at",
        {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },
        { transaction: t }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.removeColumn("conversation_participants", "left_at", {
        transaction: t,
      });
    });
  },
};
