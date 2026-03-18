import { createClient } from "@supabase/supabase-js";
import Book from "../models/Book.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function formatTitle(raw) {
  if (!raw) return "Livro";

  return String(raw)
    .replace(/\.(pdf|epub|mobi)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function generateCover(title = "Livro") {
  return `https://dummyimage.com/300x450/1e1e2f/e50914.png&text=${encodeURIComponent(
    title.slice(0, 30)
  )}`;
}

function normalizeMongoBook(book, req) {
  const obj = book.toObject ? book.toObject() : book;
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  const fileUrl = obj.fileUrl || obj.file_url || "";
  const coverUrl = obj.coverUrl || obj.cover_url || generateCover(obj.title);

  return {
    id: obj._id,
    _id: obj._id,
    title: formatTitle(obj.title),
    author: obj.author || "Desconhecido",
    category: obj.category || "Geral",
    description: obj.description || "Livro disponível na biblioteca",
    fileUrl,
    file_url: fileUrl,
    coverUrl,
    cover_url: coverUrl,
    fileType: obj.fileType || obj.file_type || "pdf",
    file_type: obj.fileType || obj.file_type || "pdf",
    createdAt: obj.createdAt || new Date(),
    created_at: obj.createdAt || new Date(),
    source: "mongo",
    downloadUrl: fileUrl.startsWith("http") ? fileUrl : `${baseUrl}${fileUrl}`,
  };
}

function normalizeSupabaseBook(book) {
  const title = formatTitle(book.title || book.name || "Livro");
  const fileUrl = book.file_url || "";
  const coverUrl = book.cover_url || generateCover(title);

  return {
    id: book.id,
    _id: book.id,
    title,
    author: book.author || "Desconhecido",
    category: book.category || "Geral",
    description: book.description || "Livro disponível na biblioteca",
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
    const key =
      book.id ||
      book._id ||
      book.fileUrl ||
      `${book.title}-${book.author}-${book.createdAt}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const listBooks = async (req, res) => {
  try {
    const search = (req.query.search || "").trim().toLowerCase();

    const mongoBooks = await Book.find().sort({ createdAt: -1 }).limit(300);

    const { data: supaBooks, error } = await supabase
      .from("books")
      .select("*")
      .limit(300);

    if (error) {
      console.error("Supabase listBooks error:", error.message);
    }

    let mongo = mongoBooks.map((b) => normalizeMongoBook(b, req));
    let supa = (supaBooks || []).map(normalizeSupabaseBook);

    if (search) {
      mongo = mongo.filter(
        (b) =>
          (b.title || "").toLowerCase().includes(search) ||
          (b.author || "").toLowerCase().includes(search) ||
          (b.category || "").toLowerCase().includes(search)
      );

      supa = supa.filter(
        (b) =>
          (b.title || "").toLowerCase().includes(search) ||
          (b.author || "").toLowerCase().includes(search) ||
          (b.category || "").toLowerCase().includes(search)
      );
    }

    const allBooks = dedupeBooks([...supa, ...mongo]).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.json(allBooks);
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
      return res.json(normalizeMongoBook(mongoBook, req));
    }

    const { data, error } = await supabase
      .from("books")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Livro não encontrado" });
    }

    return res.json(normalizeSupabaseBook(data));
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
      const fileUrl = mongoBook.fileUrl || mongoBook.file_url;
      if (!fileUrl) {
        return res.status(404).json({ error: "Arquivo não encontrado" });
      }
      return res.redirect(fileUrl);
    }

    const { data, error } = await supabase
      .from("books")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data || !data.file_url) {
      return res.status(404).json({ error: "Arquivo não encontrado" });
    }

    return res.redirect(data.file_url);
  } catch (err) {
    console.error("downloadBook error:", err);
    return res.status(500).json({ error: "Erro ao baixar livro" });
  }
};

export const createBook = async (req, res) => {
  try {
    const file = req.file;

    const title = req.body.title || file?.originalname || "Livro";
    const author = req.body.author || "Desconhecido";
    const category = req.body.category || "Geral";
    const description = req.body.description || "Livro disponível na biblioteca";

    const fileUrl =
      req.body.fileUrl ||
      req.body.file_url ||
      (file ? `/uploads/files/${file.filename}` : "");

    const coverUrl =
      req.body.coverUrl ||
      req.body.cover_url ||
      generateCover(formatTitle(title));

    const fileType =
      req.body.fileType ||
      req.body.file_type ||
      (file?.mimetype?.includes("epub") ? "epub" : "pdf");

    const newBook = await Book.create({
      title: formatTitle(title),
      author,
      category,
      description,
      fileUrl,
      coverUrl,
      fileType,
    });

    return res.status(201).json(normalizeMongoBook(newBook, req));
  } catch (err) {
    console.error("createBook error:", err);
    return res.status(500).json({ error: "Erro ao criar livro" });
  }
};

export const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Book.findByIdAndDelete(id);

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
    const mongoBooks = await Book.find().sort({ createdAt: -1 }).limit(20);
    const { data: supaBooks } = await supabase.from("books").select("*").limit(20);

    const mongo = mongoBooks.map((b) => normalizeMongoBook(b, req));
    const supa = (supaBooks || []).map(normalizeSupabaseBook);

    const allBooks = dedupeBooks([...supa, ...mongo]).slice(0, 20);

    return res.json(allBooks);
  } catch (err) {
    console.error("topDownloads error:", err);
    return res.status(500).json({ error: "Erro ao buscar top livros" });
  }
};

export const recommended = async (req, res) => {
  try {
    const mongoBooks = await Book.find().sort({ createdAt: -1 }).limit(20);
    const { data: supaBooks } = await supabase.from("books").select("*").limit(20);

    const mongo = mongoBooks.map((b) => normalizeMongoBook(b, req));
    const supa = (supaBooks || []).map(normalizeSupabaseBook);

    const allBooks = dedupeBooks([...supa, ...mongo])
      .sort(() => Math.random() - 0.5)
      .slice(0, 20);

    return res.json(allBooks);
  } catch (err) {
    console.error("recommended error:", err);
    return res.status(500).json({ error: "Erro ao buscar recomendados" });
  }
};