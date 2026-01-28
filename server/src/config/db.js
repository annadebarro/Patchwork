const mongoose = require("mongoose");

async function connectToDatabase(uri) {
  if (!uri) {
    throw new Error("Missing MongoDB connection string (MONGODB_URI)");
  }

  mongoose.connection.on("connected", () => {
    // Use console for now; consider a logger later
    console.log("MongoDB connected");
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
  });

  return mongoose.connect(uri);
}

module.exports = { connectToDatabase };
