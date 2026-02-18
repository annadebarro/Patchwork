const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const { supabase } = require("../config/storage");

const router = express.Router();

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const DEFAULT_BUCKET = "images";

const storage = multer.memoryStorage();

function isImage(mimeType) {
  return typeof mimeType === "string" && mimeType.startsWith("image/");
}

function safeFolder(input) {
  if (!input) return "";
  const normalized = String(input)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid folder path.");
  }

  return normalized;
}

function safeExtension(file) {
  const original = file?.originalname ? path.extname(file.originalname) : "";
  if (!original) return "";
  if (!/^[a-zA-Z0-9.]+$/.test(original)) return "";
  return original.toLowerCase();
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isImage(file.mimetype)) {
      return cb(new Error("Only image uploads are allowed."));
    }
    return cb(null, true);
  },
});

router.post("/", upload.single("file"), async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "File uploads are not configured." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Missing file upload." });
  }

  const bucket = process.env.SUPABASE_BUCKET || DEFAULT_BUCKET;

  let folder = "";
  try {
    folder = safeFolder(req.body?.folder);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const extension = safeExtension(req.file);
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const filePath = folder ? `${folder}/${filename}` : filename;

  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const { data: publicData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return res.status(201).json({
      bucket,
      path: filePath,
      publicUrl: publicData?.publicUrl || null,
    });
  } catch (err) {
    console.error("Upload failed:", err);
    return res.status(500).json({ error: "Upload failed." });
  }
});

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res.status(400).json({ error: err.message || "Upload error." });
  }

  return res.status(500).json({ error: "Upload error." });
});

module.exports = router;
