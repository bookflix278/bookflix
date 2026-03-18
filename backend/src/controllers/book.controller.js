import { createClient } from "@supabase/supabase-js";
import Book from "../models/Book.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatTitle(raw) {
  if (!raw) return "Livro";

  const clean = String(raw)
    .replace(/\.(pdf|epub|mobi)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "Livro";

  if (clean.length > 20 && /^[a-f0-9]+$/i.test(clean)) {
    return `Livro ${clean.slice(0, 6)}`;
  }

  return clean;
}

function generateCover(title = "Livro") {
  const palettes = [
    ["1e1e2f", "e50914"],
    ["0f2027", "2c5364"],
    ["232526", "414345"],
    ["42275a", "734b6d"],
    ["141e30", "243b55"],
  ];

  const [from, to] = palettes[Math.floor(Math.random() * palettes.length)];
  const safeTitle = encodeURIComponent(title.slice(0, 32));

  return `https://dummyimage.com/300x450/${from}/${to}.png&text=${safeTitle}`;
}

function normalizeMongoBook(book, req) {
  const obj = book.toObject ? book.toObject() : book;
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  return {
    _id: obj._id,
    id: obj._id,
    title: formatTitle(obj.title),
    author: obj.author || "Desconhecido",
    category: obj.category || "Geral",
    description: obj.description || "Livro disponível na biblioteca",
    file_url: obj.fileUrl || obj.file_url || "",
    fileUrl: obj.fileUrl || obj.file_url || "",
    cover_url: obj.coverUrl || obj.cover_url || generateCover(obj.title),
    coverUrl: obj.coverUrl || obj.cover_url || generateCover(obj.title),
    file_type: obj.fileType || obj.file_type || "pdf",
    fileType: obj.fileType || obj.file_type || "pdf",
    source: "mongo",
    created_at: obj.createdAt || new Date(),
    createdAt: obj.createdAt || new Date(),
    downloadUrl:
      obj.fileUrl?.startsWith("http") || obj.file_url?.startsWith("http")
        ? obj.fileUrl || obj.file_url
        : `${baseUrl}${obj.fileUrl || obj.file_url || ""}`,
  };
}

function normalizeSupabaseBook(book) {
  const title = formatTitle(book.title || book.name || book.file_name || "Livro");

  return {
    _id: book.id,
    id: book.id,
    title,
    author: book.author || "Desconhecido",
    category: book.category || "Geral",
    description: book.description || "Livro disponível na biblioteca",
    file_url: book.file_url || "",
    fileUrl: book.file_url || "",
    cover_url: book.cover_url || generateCover(title),
    coverUrl: book.cover_url || generateCover(title),
    file_type: book.file_type || "pdf",
    fileType: book.file_type || "pdf",
    source: "supabase",
    created_at: book.created_at || new Date(),
    createdAt: book.created_at || new Date(),
    downloadUrl: book.file_url || "",
  };
}

function dedupeBooks(books = []) {
  const seen = new Set();

  return books.filter((book) => {
    const key =
      book.id ||
      book._id ||
      book.file_url ||
      `${book.title}-${book.author}-${book.created_at}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchSupabaseBooks(search = "") {
  const { data, error } = await supabase.from("books").select("*").limit(500);

  if (error) {
    console.error("Supabase error:", error.message);
    return [];
  }

  let books = (data || []).map(normalizeSupabaseBook);

  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    books = books.filter(
      (b) => rx.test(b.title) || rx.test(b.author) || rx.test(b.category)
    );
  }

  return books;
}

async function fetchMongoBooks(search = "") {
  let mongoBooks = [];

  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    mongoBooks = await Book.find({
      $or: [{ title: rx }, { author: rx }, { category: rx }],
    }).sort({ createdAt: -1 });
  } else {
    mongoBooks = await Book.find().sort({ createdAt: -1 }).limit(500);
  }

  return mongoBooks;
}

export const getBooks = async (req, res) => {
  try {
    const search = req.query.search || "";

    const [mongoBooks, supabaseBooks] = await Promise.all([
      fetchMongoBooks(search),
      fetchSupabaseBooks(search),
    ]);

    const mongoNormalized = mongoBooks.map((book) => normalizeMongoBook(book, req));
    const allBooks = dedupeBooks([...supabaseBooks, ...mongoNormalized]).sort(
      (a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at)
    );

    return res.json(allBooks);
  } catch (error) {
    console.error("getBooks error:", error);
    return res.status(500).json({ error: "Erro ao buscar livros" });
  }
};

export const getBookById = async (req, res) => {
  try {
    const { id } = req.params;

    const mongoBook = await Book.findById(id).catch(() => null);
    if (mongoBook) {
      return res.json(normalizeMongoBook(mongoBook, req));
    }

    const { data, error } = await supabase.from("books").select("*").eq("id", id).single();

    if (error || !data) {
      return res.status(404).json({ error: "Livro não encontrado" });
    }

    return res.json(normalizeSupabaseBook(data));
  } catch (error) {
    console.error("getBookById error:", error);
    return res.status(500).json({ error: "Erro ao buscar livro" });
  }
};

export const createBook = async (req, res) => {
  try {
    const { title, author, category, description } = req.body;

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const uploadedFile = req.file;

    const fileUrl = uploadedFile
      ? `/uploads/files/${uploadedFile.filename}`
      : req.body.fileUrl || req.body.file_url || "";

    const coverUrl =
      req.body.coverUrl ||
      req.body.cover_url ||
      generateCover(title || uploadedFile?.originalname || "Livro");

    const fileType =
      req.body.fileType ||
      req.body.file_type ||
      uploadedFile?.mimetype?.includes("epub")
        ? "epub"
        : "pdf";

    const newBook = await Book.create({
      title: formatTitle(title || uploadedFile?.originalname || "Livro"),
      author: author || "Desconhecido",
      category: category || "Geral",
      description: description || "Livro disponível na biblioteca",
      fileUrl,
      coverUrl,
      fileType,
    });

    const normalized = normalizeMongoBook(newBook, req);

    if (normalized.fileUrl && !normalized.fileUrl.startsWith("http")) {
      normalized.downloadUrl = `${baseUrl}${normalized.fileUrl}`;
    }

    return res.status(201).json(normalized);
  } catch (error) {
    console.error("createBook error:", error);
    return res.status(500).json({ error: "Erro ao criar livro" });
  }
};

export const updateBook = async (req, res) => {
  try {
    const { id } = req.params;

    const updates = {};
    if (req.body.title !== undefined) updates.title = formatTitle(req.body.title);
    if (req.body.author !== undefined) updates.author = req.body.author || "Desconhecido";
    if (req.body.category !== undefined) updates.category = req.body.category || "Geral";
    if (req.body.description !== undefined)
      updates.description = req.body.description || "Livro disponível na biblioteca";
    if (req.body.fileUrl !== undefined || req.body.file_url !== undefined)
      updates.fileUrl = req.body.fileUrl || req.body.file_url;
    if (req.body.coverUrl !== undefined || req.body.cover_url !== undefined)
      updates.coverUrl = req.body.coverUrl || req.body.cover_url;
    if (req.body.fileType !== undefined || req.body.file_type !== undefined)
      updates.fileType = req.body.fileType || req.body.file_type;

    const book = await Book.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!book) {
      return res.status(404).json({ error: "Livro não encontrado para atualizar" });
    }

    return res.json(normalizeMongoBook(book, req));
  } catch (error) {
    console.error("updateBook error:", error);
    return res.status(500).json({ error: "Erro ao atualizar livro" });
  }
};

export const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Book.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Livro não encontrado para excluir" });
    }

    return res.json({ ok: true, message: "Livro removido com sucesso" });
  } catch (error) {
    console.error("deleteBook error:", error);
    return res.status(500).json({ error: "Erro ao excluir livro" });
  }
};

export const getTopBooks = async (req, res) => {
  try {
    const [mongoBooks, supabaseBooks] = await Promise.all([
      Book.find().sort({ createdAt: -1 }).limit(20),
      fetchSupabaseBooks(""),
    ]);

    const mongoNormalized = mongoBooks.map((book) => normalizeMongoBook(book, req));
    const allBooks = dedupeBooks([...supabaseBooks, ...mongoNormalized])
      .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))
      .slice(0, 20);

    return res.json(allBooks);
  } catch (error) {
    console.error("getTopBooks error:", error);
    return res.status(500).json({ error: "Erro ao buscar destaques" });
  }
};

export const getRecommendedBooks = async (req, res) => {
  try {
    const [mongoBooks, supabaseBooks] = await Promise.all([
      Book.find().sort({ createdAt: -1 }).limit(20),
      fetchSupabaseBooks(""),
    ]);

    const mongoNormalized = mongoBooks.map((book) => normalizeMongoBook(book, req));
    const allBooks = dedupeBooks([...supabaseBooks, ...mongoNormalized])
      .sort(() => Math.random() - 0.5)
      .slice(0, 20);

    return res.json(allBooks);
  } catch (error) {
    console.error("getRecommendedBooks error:", error);
    return res.status(500).json({ error: "Erro ao buscar recomendações" });
  }
};