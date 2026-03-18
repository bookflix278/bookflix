import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import Book from "../models/Book.js";
import { generateCover } from "../utils/pdfCover.js";

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve("uploads");
const BOOKS_DIR = path.join(UPLOADS_DIR, "books");
const COVERS_DIR = path.join(UPLOADS_DIR, "covers");

function safeName(name = "") {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim();
}

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
  const data = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

export async function createBook(req, res, next) {
  try {
    const { title, author, description } = req.body;
    let { category } = req.body;

    const file = req.files?.file?.[0];
    const coverFile = req.files?.cover?.[0];

    if (!file) {
      return res.status(400).json({ error: "Arquivo do livro é obrigatório." });
    }

    if (!title || !author || !description) {
      return res.status(400).json({ error: "Preencha título, autor e descrição." });
    }

    const ext = extFromName(file.originalname || file.filename);
    if (![".pdf", ".epub"].includes(ext)) {
      return res.status(400).json({ error: "Envie apenas PDF ou EPUB." });
    }

    if (!category || !category.trim()) {
      category = detectCategory(title);
    }

    let cover = null;

    if (coverFile) {
      cover = {
        filename: coverFile.filename,
        mime: coverFile.mimetype,
        size: coverFile.size,
      };
    } else {
      const generated = await generateCover({
        title: safeName(title),
        author: safeName(author),
        category: safeName(category),
        coversDir: COVERS_DIR,
      });

      cover = {
        filename: generated.filename,
        mime: generated.mime,
        size: generated.size,
      };
    }

    const filePath = path.join(BOOKS_DIR, file.filename);

    const book = await Book.create({
      title: safeName(title),
      author: safeName(author),
      category: safeName(category),
      description: String(description).trim(),
      cover,
      file: {
        filename: file.filename,
        mime: fileMimeFromExt(ext),
        size: file.size,
        sha256: await sha256File(filePath),
      },
      uploadedBy: req.user.id,
      downloads: 0,
      status: "active",
    });

    return res.status(201).json({ book });
  } catch (err) {
    return next(err);
  }
}

export async function listBooks(req, res, next) {
  try {
    const { search = "", category = "", sort = "recent", limit = "200", page = "1" } = req.query;

    const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 200));
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const skip = (pg - 1) * lim;

    const filter = { status: "active" };

    if (category) filter.category = category;

    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: rx }, { author: rx }, { category: rx }];
    }

    const sortMap = {
      recent: { createdAt: -1 },
      downloads: { downloads: -1, createdAt: -1 },
      az: { title: 1 },
    };

    const books = await Book.find(filter)
      .populate("uploadedBy", "name")
      .sort(sortMap[sort] || sortMap.recent)
      .skip(skip)
      .limit(lim);

    const total = await Book.countDocuments(filter);

    return res.json({
      books,
      page: pg,
      total,
      totalPages: Math.ceil(total / lim),
    });
  } catch (err) {
    return next(err);
  }
}

export async function getBook(req, res, next) {
  try {
    const book = await Book.findById(req.params.id).populate("uploadedBy", "name");
    if (!book || book.status !== "active") {
      return res.status(404).json({ error: "Livro não encontrado." });
    }
    return res.json({ book });
  } catch (err) {
    return next(err);
  }
}

export async function downloadBook(req, res, next) {
  try {
    const book = await Book.findById(req.params.id);
    if (!book || book.status !== "active") {
      return res.status(404).json({ error: "Livro não encontrado." });
    }

    const filePath = path.join(BOOKS_DIR, book.file.filename);

    book.downloads += 1;
    await book.save();

    const ext = extFromName(book.file.filename);
    const downloadName = `${safeName(book.title)}${ext}`;

    return res.download(filePath, downloadName);
  } catch (err) {
    return next(err);
  }
}

export async function topDownloads(req, res, next) {
  try {
    const books = await Book.find({ status: "active" })
      .populate("uploadedBy", "name")
      .sort({ downloads: -1, createdAt: -1 })
      .limit(20);

    return res.json({ books });
  } catch (err) {
    return next(err);
  }
}

export async function recommended(req, res, next) {
  try {
    const books = await Book.find({ status: "active" })
      .populate("uploadedBy", "name")
      .sort({ createdAt: -1, downloads: -1 })
      .limit(20);

    return res.json({ books });
  } catch (err) {
    return next(err);
  }
}

export async function deleteBook(req, res, next) {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Livro não encontrado." });

    const filePath = path.join(BOOKS_DIR, book.file?.filename || "");
    const coverPath = path.join(COVERS_DIR, book.cover?.filename || "");

    await fs.unlink(filePath).catch(() => {});
    await fs.unlink(coverPath).catch(() => {});
    await Book.deleteOne({ _id: book._id });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}
