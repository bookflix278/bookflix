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
    .trim();
}

function generateCover(title = "Livro") {
  return `https://dummyimage.com/300x450/1e1e2f/e50914.png&text=${encodeURIComponent(
    title.slice(0, 20)
  )}`;
}

// ========================
// 📚 LISTAR LIVROS
// ========================
export const listBooks = async (req, res) => {
  try {
    const mongoBooks = await Book.find().sort({ createdAt: -1 }).limit(200);

    const { data: supaBooks } = await supabase
      .from("books")
      .select("*")
      .limit(200);

    const mongo = mongoBooks.map((b) => ({
      id: b._id,
      title: formatTitle(b.title),
      author: b.author || "Desconhecido",
      coverUrl: b.coverUrl || generateCover(b.title),
      fileUrl: b.fileUrl,
      createdAt: b.createdAt,
    }));

    const supa =
      supaBooks?.map((b) => ({
        id: b.id,
        title: formatTitle(b.title),
        author: b.author || "Desconhecido",
        coverUrl: b.cover_url || generateCover(b.title),
        fileUrl: b.file_url,
        createdAt: b.created_at,
      })) || [];

    return res.json([...supa, ...mongo]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar livros" });
  }
};

// ========================
// 📖 PEGAR 1 LIVRO
// ========================
export const getBook = async (req, res) => {
  try {
    const { id } = req.params;

    const mongo = await Book.findById(id);
    if (mongo) return res.json(mongo);

    const { data } = await supabase
      .from("books")
      .select("*")
      .eq("id", id)
      .single();

    if (!data) return res.status(404).json({ error: "Livro não encontrado" });

    return res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar livro" });
  }
};

// ========================
// ⬇️ DOWNLOAD
// ========================
export const downloadBook = async (req, res) => {
  try {
    const { id } = req.params;

    const mongo = await Book.findById(id);
    if (mongo) {
      return res.redirect(mongo.fileUrl);
    }

    const { data } = await supabase
      .from("books")
      .select("*")
      .eq("id", id)
      .single();

    if (!data) return res.status(404).json({ error: "Livro não encontrado" });

    return res.redirect(data.file_url);
  } catch (err) {
    res.status(500).json({ error: "Erro no download" });
  }
};

// ========================
// 🆕 CREATE
// ========================
export const createBook = async (req, res) => {
  try {
    const file = req.file;

    const newBook = await Book.create({
      title: formatTitle(file?.originalname || "Livro"),
      author: "Desconhecido",
      coverUrl: generateCover(file?.originalname),
      fileUrl: `/uploads/files/${file.filename}`,
    });

    res.json(newBook);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar livro" });
  }
};

// ========================
// 🗑️ DELETE
// ========================
export const deleteBook = async (req, res) => {
  try {
    await Book.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao deletar" });
  }
};

// ========================
// 🔥 TOP
// ========================
export const topDownloads = async (req, res) => {
  const books = await Book.find().limit(10);
  res.json(books);
};

// ========================
// 🎯 RECOMENDADOS
// ========================
export const recommended = async (req, res) => {
  const books = await Book.find().limit(10);
  res.json(books.sort(() => Math.random() - 0.5));
};