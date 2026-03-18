import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const uploadsRoot = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve("uploads");

const bookDir = path.join(uploadsRoot, "books");
const coverDir = path.join(uploadsRoot, "covers");
const zipDir = path.join(uploadsRoot, "zips");

ensureDir(bookDir);
ensureDir(coverDir);
ensureDir(zipDir);

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
  limits: { fileSize: 50 * 1024 * 1024 },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "cover", maxCount: 1 },
]);

const zipStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, zipDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".zip";
    const name = crypto.randomBytes(16).toString("hex");
    cb(null, `${name}${ext}`);
  },
});

const zipMulter = multer({
  storage: zipStorage,
  limits: { fileSize: 800 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith(".zip") || file.mimetype === "application/zip";
    cb(ok ? null : new Error("Envie um arquivo .zip"), ok);
  },
}).fields([
  { name: "zip", maxCount: 1 },
  { name: "file", maxCount: 1 }
]);

export function uploadBulkZip(req, res, next) {
  zipMulter(req, res, (err) => {
    if (err) return next(err);
    req.file = req.files?.zip?.[0] || req.files?.file?.[0] || null;
    return next();
  });
}
