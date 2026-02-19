module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("quilts", "preview_image_url", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("quilts", "preview_image_url");
  },
};
