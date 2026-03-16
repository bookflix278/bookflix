import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";

import adminRoutes from "./routes/admin.routes.js";
import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import bookRoutes from "./routes/book.routes.js";
import { findProjectRoot, ensureDir } from "./utils/projectRoot.js";

const app = express();

// IMPORTANTE: CORS e JSON vêm antes das rotas
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "5mb" }));

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// ====== UPLOADS PATH FIX ======
const PROJECT_ROOT = findProjectRoot(process.cwd());

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(PROJECT_ROOT, "uploads");

const COVERS_DIR = path.join(UPLOADS_DIR, "covers");
const FILES_DIR = path.join(UPLOADS_DIR, "books");

ensureDir(COVERS_DIR);
ensureDir(FILES_DIR);

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// API routes
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);

// Static files
app.use(
  "/covers",
  express.static(COVERS_DIR, {
    fallthrough: true,
    maxAge: "7d",
  })
);

app.use(
  "/files",
  express.static(FILES_DIR, {
    fallthrough: true,
    maxAge: "7d",
  })
);

// Fallback extra para capas
app.get("/covers/:file", (req, res) => {
  const f = req.params.file;

  const candidates = [
    path.join(COVERS_DIR, f),
    path.join(PROJECT_ROOT, "backend", "uploads", "covers", f),
    path.join(PROJECT_ROOT, "src", "uploads", "covers", f),
    path.join(process.cwd(), "uploads", "covers", f),
  ];

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) return res.status(404).json({ error: "Cover not found" });

  return res.sendFile(found);
});

export default app;