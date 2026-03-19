import { createClient } from "@supabase/supabase-js";
import Book from "../models/Book.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function isHashLike(value = "") {
  const v = String(value || "").replace(/\.(pdf|epub|mobi|azw3)$/i, "");
  return v.length >= 20 && /^[a-f0-9]+$/i.test(v);
}

function titleFromUrl(fileUrl = "") {
  try {
    const pathname = new URL(fileUrl).pathname;
    const raw = decodeURIComponent(path.basename(pathname));
    return raw || "";
  } catch {
    return "";
  }
}

function formatTitle(raw, fallbackUrl = "") {
  let value = String(raw || "").trim();

  if (!value && fallbackUrl) value = titleFromUrl(fallbackUrl);

  value = value
    .replace(/\.(pdf|epub|mobi|azw3)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!value) return "Livro";
  if (isHashLike(value)) return `Livro ${value.slice(0, 6)}`;
  return value;
}

function generateCover(title = "Livro") {
  const palettes = [
    ["1e1e2f", "e50914"],
    ["141e30", "243b55"],
    ["232526", "414345"],
    ["42275a", "734b6d"],
    ["0f2027", "2c5364"],
  ];
  const [from, to] = palettes[Math.floor(Math.random() * palettes.length)];
  return `https://dummyimage.com/300x450/${from}/${to}.png&text=${encodeURIComponent(title.slice(0, 28))}`;
}

function normalizeMongoBook(book, req) {
  const obj = book.toObject ? book.toObject() : book;
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  const rawFileUrl = obj.fileUrl || obj.file_url || (obj.file?.filename ? `/files/${obj.file.filename}` : "");
  const rawCoverUrl = obj.coverUrl || obj.cover_url || (obj.cover?.filename ? `/covers/${obj.cover.filename}` : "");
  const title = formatTitle(obj.title, rawFileUrl);
  const fileUrl = rawFileUrl.startsWith("http") ? rawFileUrl : `${baseUrl}${rawFileUrl}`;
  const coverUrl = rawCoverUrl
    ? rawCoverUrl.startsWith("http")
      ? rawCoverUrl
      : `${baseUrl}${rawCoverUrl}`
    : generateCover(title);

  return {
    id: String(obj._id),
    _id: String(obj._id),
    title,
    author: obj.author || "Desconhecido",
    category: obj.category || "Geral",
    description: obj.description || "Livro disponível na biblioteca",
    downloads: obj.downloads || 0,
    fileUrl,
    file_url: fileUrl,
    coverUrl,
    cover_url: coverUrl,
    fileType: obj.fileType || obj.file_type || obj.file?.mime || "pdf",
    file_type: obj.fileType || obj.file_type || obj.file?.mime || "pdf",
    createdAt: obj.createdAt || new Date(),
    created_at: obj.createdAt || new Date(),
    source: "mongo",
    downloadUrl: fileUrl,
  };
}

function normalizeSupabaseBook(book) {
  const fileUrl = book.file_url || "";
  const title = formatTitle(book.title || book.name || book.file_name, fileUrl);
  const coverUrl = book.cover_url || generateCover(title);

  return {
    id: String(book.id),
    _id: String(book.id),
    title,
    author: book.author || "Desconhecido",
    category: book.category || "Geral",
    description: book.description || "Livro disponível na biblioteca",
    downloads: book.downloads || 0,
    fileUrl,
    file_url: fileUrl,
    coverUrl,
    cover_url: coverUrl,
    fileType: book.file_type || "pdf",
    file_type: book.file_type || "pdf",
    createdAt: book.created_at || new Date(),
    created_at: book.created_at || new Date(),
    source: "supabase",
    downloadUrl: fileUrl,
  };
}

function dedupeBooks(books = []) {
  const seen = new Set();
  return books.filter((book) => {
    const key = book.file_url || book.fileUrl || book.id || book._id || `${book.title}-${book.author}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchSupabaseBooks() {
  try {
    const { data, error } = await supabase.from("books").select("*").limit(1000);
    if (error) {
      console.error("Supabase listBooks error:", error.message);
      return [];
    }
    return (data || []).map(normalizeSupabaseBook);
  } catch (error) {
    console.error("Supabase fetch crash:", error);
    return [];
  }
}

async function fetchMongoBooks(req) {
  try {
    const mongoBooks = await Book.find({ status: { $ne: "removed" } }).sort({ createdAt: -1 }).limit(500);
    return mongoBooks.map((b) => normalizeMongoBook(b, req));
  } catch (error) {
    console.error("Mongo fetch crash:", error);
    return [];
  }
}

function filterBooks(books, search = "") {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return books;
  return books.filter((b) =>
    [b.title, b.author, b.category, b.description]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  );
}

export const listBooks = async (req, res) => {
  try {
    const search = req.query.search || "";
    const [mongo, supa] = await Promise.all([fetchMongoBooks(req), fetchSupabaseBooks()]);
    const books = dedupeBooks(filterBooks([...supa, ...mongo], search)).sort(
      (a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0)
    );
    return res.json({ books });
  } catch (err) {
    console.error("listBooks error:", err);
    return res.status(500).json({ error: "Erro ao buscar livros" });
  }
};

export const getBook = async (req, res) => {
  try {
    const { id } = req.params;

    const mongoBook = await Book.findById(id).catch(() => null);
    if (mongoBook) {
      return res.json({ book: normalizeMongoBook(mongoBook, req) });
    }

    const { data, error } = await supabase.from("books").select("*").eq("id", id).single();
    if (error || !data) {
      return res.status(404).json({ error: "Livro não encontrado" });
    }

    return res.json({ book: normalizeSupabaseBook(data) });
  } catch (err) {
    console.error("getBook error:", err);
    return res.status(500).json({ error: "Erro ao buscar livro" });
  }
};

export const downloadBook = async (req, res) => {
  try {
    const { id } = req.params;

    const mongoBook = await Book.findById(id).catch(() => null);
    if (mongoBook) {
      const fileUrl = normalizeMongoBook(mongoBook, req).downloadUrl;
      if (!fileUrl) return res.status(404).json({ error: "Arquivo não encontrado" });
      return res.redirect(fileUrl);
    }

    const { data, error } = await supabase.from("books").select("file_url").eq("id", id).single();
    if (error || !data?.file_url) {
      return res.status(404).json({ error: "Arquivo não encontrado" });
    }
    return res.redirect(data.file_url);
  } catch (err) {
    console.error("downloadBook error:", err);
    return res.status(500).json({ error: "Erro ao baixar livro" });
  }
};

function sha256OfFile(filepath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filepath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export const createBook = async (req, res) => {
  try {
    const file = req.files?.file?.[0] || req.file || null;
    const cover = req.files?.cover?.[0] || null;

    if (!file) {
      return res.status(400).json({ error: "Arquivo do livro é obrigatório." });
    }

    const title = formatTitle(req.body.title || file.originalname);
    const author = req.body.author || "Desconhecido";
    const category = req.body.category || "Geral";
    const description = req.body.description || "Livro disponível na biblioteca";
    const sha256 = await sha256OfFile(file.path);

    const newBook = await Book.create({
      title,
      author,
      category,
      description,
      cover: cover
        ? { filename: cover.filename, mime: cover.mimetype, size: cover.size }
        : undefined,
      file: {
        filename: file.filename,
        mime: file.mimetype,
        size: file.size,
        sha256,
      },
      uploadedBy: req.user?.id,
    });

    return res.status(201).json({ book: normalizeMongoBook(newBook, req) });
  } catch (err) {
    console.error("createBook error:", err);
    return res.status(500).json({ error: "Erro ao criar livro" });
  }
};

export const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Book.findByIdAndUpdate(id, { status: "removed" }, { new: true });
    if (!deleted) {
      return res.status(404).json({ error: "Livro não encontrado" });
    }
    return res.json({ ok: true, message: "Livro excluído com sucesso" });
  } catch (err) {
    console.error("deleteBook error:", err);
    return res.status(500).json({ error: "Erro ao excluir livro" });
  }
};

export const topDownloads = async (req, res) => {
  try {
    const [mongo, supa] = await Promise.all([fetchMongoBooks(req), fetchSupabaseBooks()]);
    const books = dedupeBooks([...supa, ...mongo])
      .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
      .slice(0, 20);
    return res.json({ books });
  } catch (err) {
    console.error("topDownloads error:", err);
    return res.status(500).json({ error: "Erro ao buscar top livros" });
  }
};

export const recommended = async (req, res) => {
  try {
    const [mongo, supa] = await Promise.all([fetchMongoBooks(req), fetchSupabaseBooks()]);
    const books = dedupeBooks([...supa, ...mongo])
      .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))
      .slice(0, 20);
    return res.json({ books });
  } catch (err) {
    console.error("recommended error:", err);
    return res.status(500).json({ error: "Erro ao buscar recomendados" });
  }
};
