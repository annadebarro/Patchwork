const { getModels } = require("../models");

async function requireAdminMiddleware(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { User } = getModels();
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "role"],
    });

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required." });
    }

    req.adminUser = user;
    return next();
  } catch (err) {
    console.error("Admin authorization check failed:", err);
    return res.status(500).json({ message: "Failed to authorize admin access." });
  }
}

module.exports = requireAdminMiddleware;
