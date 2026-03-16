import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ✅ agora salvamos pdf/epub na mesma pasta
const bookDir = path.resolve("uploads/books");
const coverDir = path.resolve("uploads/covers");
ensureDir(bookDir);
ensureDir(coverDir);

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === "file") cb(null, bookDir);
    else cb(null, coverDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomBytes(16).toString("hex");
    cb(null, `${name}${ext}`);
  },
});

export const uploadBookFiles = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
}).fields([
  { name: "file", maxCount: 1 },  // ✅ pdf ou epub
  { name: "cover", maxCount: 1 }, // ✅ opcional
]);

// ✅ upload em massa via ZIP (limite maior)
const zipDir = path.resolve("uploads/zips");
ensureDir(zipDir);

const zipStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, zipDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".zip";
    const name = crypto.randomBytes(16).toString("hex");
    cb(null, `${name}${ext}`);
  },
});

export const uploadBulkZip = multer({
  storage: zipStorage,
  limits: { fileSize: 800 * 1024 * 1024 }, // 800MB
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith(".zip") || file.mimetype === "application/zip";
    cb(ok ? null : new Error("Envie um arquivo .zip"), ok);
  },
}).single("zip");