import { createClient } from '@supabase/supabase-js';
import Book from '../models/Book.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generateCover(title) {
  const colors = [
    "ff416c,ff4b2b",
    "1e3c72,2a5298",
    "11998e,38ef7d",
    "ee0979,ff6a00"
  ];

  const pick = colors[Math.floor(Math.random() * colors.length)];

  return `https://dummyimage.com/300x450/${pick.replace(",", "/")}/ffffff&text=${encodeURIComponent(title)}`;
}

function formatTitle(raw) {
  if (!raw) return "Livro";

  if (raw.length > 20 && /^[a-f0-9]+$/i.test(raw)) {
    return `Livro ${raw.slice(0, 6)}`;
  }

  return raw.replace(/[_-]/g, " ");
}

export const getBooks = async (req, res) => {
  try {
    const { search } = req.query;

    let mongoBooks = [];

    if (search) {
      const rx = new RegExp(search, 'i');

      mongoBooks = await Book.find({
        $or: [
          { title: rx },
          { author: rx },
          { category: rx }
        ]
      });
    } else {
      mongoBooks = await Book.find()
        .sort({ createdAt: -1 })
        .limit(100);
    }

    let supabaseBooks = [];

    const { data, error } = await supabase
      .from('books')
      .select('*')
      .limit(200);

    if (!error && data) {
      supabaseBooks = data.map((b) => ({
        _id: b.id,
        title: formatTitle(b.title || b.name),
        author: b.author || "Desconhecido",
        category: b.category || "Geral",
        description: b.description || "Livro disponível na biblioteca",
        fileUrl: b.file_url,
        coverUrl: b.cover_url || generateCover(b.title || "Livro"),
        createdAt: b.created_at || new Date(),
        source: "supabase"
      }));
    }

    const allBooks = [...supabaseBooks, ...mongoBooks];

    res.json(allBooks);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar livros" });
  }
};