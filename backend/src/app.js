import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import morgan from "morgan";

import adminRoutes from "./routes/admin.routes.js";
import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import bookRoutes from "./routes/book.routes.js";
import { findProjectRoot, ensureDir } from "./utils/projectRoot.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";

const app = express();

const PROJECT_ROOT = findProjectRoot(process.cwd());
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(PROJECT_ROOT, "uploads");
const COVERS_DIR = path.join(UPLOADS_DIR, "covers");
const FILES_DIR = path.join(UPLOADS_DIR, "books");

ensureDir(COVERS_DIR);
ensureDir(FILES_DIR);

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",").map(s => s.trim()).filter(Boolean) || "*" }));
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "bookflix-backend",
    health: "/health",
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);

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

app.use(notFound);
app.use(errorHandler);

export default app;
