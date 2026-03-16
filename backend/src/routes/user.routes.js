import { Router } from "express";
import User from "../models/User.js";
import Book from "../models/Book.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/favorites", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate(
      "favorites",
      "title author category cover downloads description createdAt"
    );

    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    return res.json({ favorites: user.favorites || [] });
  } catch (err) {
    return next(err);
  }
});

router.post("/favorite/:bookId", requireAuth, async (req, res, next) => {
  try {
    const { bookId } = req.params;

    const book = await Book.findById(bookId);
    if (!book || book.status !== "active") {
      return res.status(404).json({ error: "Livro não encontrado." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    const already = user.favorites.some((id) => id.toString() === bookId);

    if (already) {
      user.favorites = user.favorites.filter((id) => id.toString() !== bookId);
    } else {
      user.favorites.push(bookId);
    }

    await user.save();

    const populated = await User.findById(req.user.id).populate(
      "favorites",
      "title author category cover downloads description createdAt"
    );

    return res.json({
      ok: true,
      isFavorite: !already,
      favorites: populated.favorites || [],
    });
  } catch (err) {
    return next(err);
  }
});

export default router;