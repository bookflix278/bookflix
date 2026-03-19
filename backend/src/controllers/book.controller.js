import path from "path";
import crypto from "crypto";
import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import Book from "../models/Book.js";
import { generateCover } from "../utils/pdfCover.js";

const supabase = process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  : null;

const uploadsRoot = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve("uploads");
const coversDir = path.join(uploadsRoot, "covers");

function isLikelyHash(value = "") {
  return /^[a-f0-9]{24,}$/i.test(String(value).trim());
}

function formatTitle(raw, fallbackFromUrl = "") {
  let source = String(raw || "").trim();

  if (!source && fallbackFromUrl) {
    try {
      const cleanUrl = fallbackFromUrl.split("?")[0];
      source = decodeURIComponent(cleanUrl.split("/").pop() || "");
    } catch {
      source = fallbackFromUrl;
    }
  }

  source = source
    .replace(/\.(pdf|epub|mobi|azw3)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!source) return "Livro";

  if (isLikelyHash(source)) {
    return `Livro ${source.slice(0, 6)}`;
  }

  if (source.length > 80) {
    return source.slice(0, 80).trim();
  }

  return source;
}

function fallbackCover(title = "Livro") {
  const palettes = [
    ["1e1e2f", "e50914"],
    ["141e30", "243b55"],
    ["2b5876", "4e4376"],
    ["232526", "414345"],
  ];
  const [bg, fg] = palettes[Math.floor(Math.random() * palettes.length)];
  return `https://dummyimage.com/300x450/${bg}/${fg}.png&text=${encodeURIComponent(title.slice(0, 22))}`;
}

function normalizeMongoBook(book, req) {
  const obj = book.toObject ? book.toObject() : book;
  const title = formatTitle(obj.title, obj.file?.filename);
  const author = obj.author || "Desconhecido";
  const category = obj.category || "Geral";
  const description = obj.description || "Livro disponível na biblioteca";
  const coverUrl = obj.cover?.filename
    ? `${req.protocol}://${req.get("host")}/covers/${obj.cover.filename}`
    : (obj.cover?.externalUrl || fallbackCover(title));
  const fileUrl = obj.file?.externalUrl
    ? obj.file.externalUrl
    : obj.file?.filename
      ? `${req.protocol}://${req.get("host")}/files/${obj.file.filename}`
      : "";

  return {
    id: String(obj._id),
    _id: String(obj._id),
    title,
    author,
    category,
    description,
    cover_url: coverUrl,
    coverUrl,
    file_url: fileUrl,
    fileUrl,
    file_type: obj.file?.mime?.includes("epub") ? "epub" : "pdf",
    fileType: obj.file?.mime?.includes("epub") ? "epub" : "pdf",
    downloads: obj.downloads || 0,
    source: "mongo",
    created_at: obj.createdAt,
    createdAt: obj.createdAt,
  };
}

function normalizeSupabaseBook(row) {
  const title = formatTitle(row.title || row.name, row.file_url || row.fileUrl || "");
  const coverUrl = row.cover_url || row.coverUrl || fallbackCover(title);
  const fileUrl = row.file_url || row.fileUrl || "";
  return {
    id: row.id,
    _id: row.id,
    title,
    author: row.author || "Desconhecido",
    category: row.category || "Geral",
    description: row.description || "Livro disponível na biblioteca",
    cover_url: coverUrl,
    coverUrl,
    file_url: fileUrl,
    fileUrl,
    file_type: row.file_type || "pdf",
    fileType: row.file_type || "pdf",
    downloads: row.downloads || 0,
    source: "supabase",
    created_at: row.created_at || new Date().toISOString(),
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function dedupeBooks(books = []) {
  const seen = new Set();
  return books.filter((book) => {
    const key = book.file_url || book.fileUrl || book.id || book._id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getSupabaseBooks() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Supabase books error:", error.message);
    return [];
  }

  return (data || []).map(normalizeSupabaseBook);
}

export async function listBooks(req, res, next) {
  try {
    const search = String(req.query.search || "").trim().toLowerCase();
    const [mongoDocs, supaBooks] = await Promise.all([
      Book.find({ status: { $ne: "removed" } }).sort({ createdAt: -1 }).limit(500),
      getSupabaseBooks(),
    ]);

    let books = [
      ...supaBooks,
      ...mongoDocs.map((doc) => normalizeMongoBook(doc, req)),
    ];

    books = dedupeBooks(books).sort(
      (a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0)
    );

    if (search) {
      books = books.filter((book) => {
        const hay = `${book.title} ${book.author} ${book.category} ${book.description}`.toLowerCase();
        return hay.includes(search);
      });
    }

    return res.json(books);
  } catch (err) {
    return next(err);
  }
}

export async function getBook(req, res, next) {
  try {
    const id = req.params.id;

    const mongoBook = await Book.findById(id).catch(() => null);
    if (mongoBook) return res.json(normalizeMongoBook(mongoBook, req));

    if (supabase) {
      const cleanId = String(id).replace(/^sb_/, "");
      const { data } = await supabase.from("books").select("*").eq("id", cleanId).maybeSingle();
      if (data) return res.json(normalizeSupabaseBook(data));
    }

    return res.status(404).json({ error: "Livro não encontrado." });
  } catch (err) {
    return next(err);
  }
}

export async function downloadBook(req, res, next) {
  try {
    const id = req.params.id;

    const mongoBook = await Book.findById(id).catch(() => null);
    if (mongoBook) {
      if (mongoBook.file?.externalUrl) return res.redirect(mongoBook.file.externalUrl);
      if (mongoBook.file?.filename) {
        mongoBook.downloads = (mongoBook.downloads || 0) + 1;
        await mongoBook.save().catch(() => {});
        return res.redirect(`${req.protocol}://${req.get("host")}/files/${mongoBook.file.filename}`);
      }
    }

    if (supabase) {
      const cleanId = String(id).replace(/^sb_/, "");
      const { data } = await supabase.from("books").select("*").eq("id", cleanId).maybeSingle();
      if (data?.file_url) return res.redirect(data.file_url);
    }

    return res.status(404).json({ error: "Arquivo não encontrado." });
  } catch (err) {
    return next(err);
  }
}

async function sha256FromFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function createBook(req, res, next) {
  try {
    const bookFile = req.files?.file?.[0];
    const coverFile = req.files?.cover?.[0];

    if (!bookFile) {
      return res.status(400).json({ error: "Arquivo do livro é obrigatório." });
    }

    const title = formatTitle(req.body.title || bookFile.originalname, bookFile.originalname);
    const author = (req.body.author || "Desconhecido").trim() || "Desconhecido";
    const category = (req.body.category || "Geral").trim() || "Geral";
    const description = (req.body.description || "Livro disponível na biblioteca").trim() || "Livro disponível na biblioteca";

    let cover = null;
    if (coverFile) {
      cover = {
        filename: coverFile.filename,
        mime: coverFile.mimetype,
        size: coverFile.size,
      };
    } else {
      const generated = await generateCover({ title, author, category, coversDir });
      cover = {
        filename: generated.filename,
        mime: generated.mime,
        size: generated.size,
      };
    }

    const doc = await Book.create({
      title,
      author,
      category,
      description,
      cover,
      file: {
        filename: bookFile.filename,
        mime: bookFile.mimetype,
        size: bookFile.size,
        sha256: await sha256FromFile(bookFile.path),
      },
      uploadedBy: req.user.id,
      downloads: 0,
      status: "active",
    });

    return res.status(201).json(normalizeMongoBook(doc, req));
  } catch (err) {
    return next(err);
  }
}

export async function deleteBook(req, res, next) {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Livro não encontrado." });
    book.status = "removed";
    await book.save();
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

export async function topDownloads(req, res, next) {
  try {
    const [mongoDocs, supaBooks] = await Promise.all([
      Book.find({ status: { $ne: "removed" } }).sort({ downloads: -1, createdAt: -1 }).limit(20),
      getSupabaseBooks(),
    ]);

    const books = dedupeBooks([
      ...supaBooks,
      ...mongoDocs.map((doc) => normalizeMongoBook(doc, req)),
    ])
      .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
      .slice(0, 20);

    return res.json(books);
  } catch (err) {
    return next(err);
  }
}

export async function recommended(req, res, next) {
  try {
    const [mongoDocs, supaBooks] = await Promise.all([
      Book.find({ status: { $ne: "removed" } }).sort({ createdAt: -1 }).limit(40),
      getSupabaseBooks(),
    ]);

    const books = dedupeBooks([
      ...supaBooks,
      ...mongoDocs.map((doc) => normalizeMongoBook(doc, req)),
    ])
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 20);

    return res.json(books);
  } catch (err) {
    return next(err);
  }
}
