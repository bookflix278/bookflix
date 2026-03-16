import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import path from "path";
import fs from "fs";

import Book from "../models/Book.js";
import { ensurePdfCoverForFile } from "../utils/pdfCover.js";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.log("Defina MONGODB_URI no .env");
  process.exit(1);
}

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), "uploads");

const BOOKS_DIR = path.join(UPLOADS_DIR, "books");
const COVERS_DIR = path.join(UPLOADS_DIR, "covers");

if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR, { recursive: true });

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Mongo conectado.");

  const books = await Book.find({
    "file.ext": "pdf",
    $or: [{ cover: { $exists: false } }, { "cover.filename": { $exists: false } }],
  });

  console.log(`📚 PDFs sem capa: ${books.length}`);

  let ok = 0;
  let fail = 0;

  for (const b of books) {
    try {
      const pdfPath = path.join(BOOKS_DIR, b.file.filename);
      if (!fs.existsSync(pdfPath)) {
        console.log("⚠️ PDF não encontrado:", b.file.filename);
        fail++;
        continue;
      }

      const cover = await ensurePdfCoverForFile({ pdfPath, coversDir: COVERS_DIR });

      b.cover = cover;
      await b.save();

      ok++;
      if (ok % 25 === 0) console.log(`✅ Geradas: ${ok}`);
    } catch (e) {
      console.log("❌ Erro em", b._id, e.message);
      fail++;
    }
  }

  console.log(`✅ Final: ok=${ok} fail=${fail}`);
  await mongoose.disconnect();
}

main();