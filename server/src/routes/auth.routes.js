import express from "express";

const router = express.Router();

router.post("/register", async (req, res) => {
  res.json({ message: "Register endpoint stub" });
});

router.post("/login", async (req, res) => {
  res.json({ message: "Login endpoint stub" });
});

export default router;
