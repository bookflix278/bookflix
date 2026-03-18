import fs from "fs";
import path from "path";
import crypto from "crypto";
import unzipper from "unzipper";
import Book from "../models/Book.js";
import { generateCover } from "./pdfCover.js";

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve("uploads");
const BOOK_DIR = path.join(UPLOADS_DIR, "books");
const COVER_DIR = path.join(UPLOADS_DIR, "covers");

function extFromName(name = "") {
  return path.extname(name).toLowerCase();
}

function fileMimeFromExt(ext) {
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".epub") return "application/epub+zip";
  return "application/octet-stream";
}

function detectCategory(title = "") {
  const t = title.toLowerCase();
  if (t.includes("amor") || t.includes("romance")) return "Romance";
  if (t.includes("historia") || t.includes("história")) return "História";
  if (t.includes("python") || t.includes("program")) return "Tecnologia";
  if (t.includes("filosof")) return "Filosofia";
  if (t.includes("relig")) return "Religião";
  if (t.includes("negocio") || t.includes("business")) return "Negócios";
  return "Geral";
}

async function sha256File(filePath) {
  const data = await fs.promises.readFile(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

export async function bulkUploadZip(req, res, next) {
  try {
    const zipFile = req.file;

    if (!zipFile) {
      return res.status(400).json({ error: "Arquivo ZIP não enviado." });
    }

    await fs.promises.mkdir(BOOK_DIR, { recursive: true });
    await fs.promises.mkdir(COVER_DIR, { recursive: true });

    const extractPath = path.join(BOOK_DIR, `bulk-${Date.now()}`);
    await fs.promises.mkdir(extractPath, { recursive: true });

    await fs
      .createReadStream(zipFile.path)
      .pipe(unzipper.Extract({ path: extractPath }))
      .promise();

    const entries = await fs.promises.readdir(extractPath, { withFileTypes: true });
    const imported = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const ext = extFromName(entry.name);
      if (![".pdf", ".epub"].includes(ext)) continue;

      const srcPath = path.join(extractPath, entry.name);
      const finalName = `${crypto.randomBytes(16).toString("hex")}${ext}`;
      const finalPath = path.join(BOOK_DIR, finalName);
      const title = path.basename(entry.name, ext);
      const category = detectCategory(title);

      await fs.promises.rename(srcPath, finalPath);
      const stat = await fs.promises.stat(finalPath);

      const cover = await generateCover({
        title,
        author: "Desconhecido",
        category,
        coversDir: COVER_DIR,
      });

      const book = await Book.create({
        title,
        author: "Desconhecido",
        description: "Importado automaticamente por upload em massa.",
        category,
        cover: {
          filename: cover.filename,
          mime: cover.mime,
          size: cover.size,
        },
        file: {
          filename: finalName,
          mime: fileMimeFromExt(ext),
          size: stat.size,
          sha256: await sha256File(finalPath),
        },
        uploadedBy: req.user.id,
        downloads: 0,
        status: "active",
      });

      imported.push(book);
    }

    await fs.promises.rm(extractPath, { recursive: true, force: true });
    await fs.promises.unlink(zipFile.path).catch(() => {});

    return res.json({
      message: "Upload em massa concluído",
      total: imported.length,
      books: imported,
    });
  } catch (err) {
    return next(err);
  }
}
