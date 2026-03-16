import fs from "fs/promises";
import path from "path";
import Book from "../models/Book.js";
import User from "../models/User.js";

const UPLOADS_DIR = path.resolve("uploads");
const BOOKS_DIR = path.join(UPLOADS_DIR, "books");
const COVERS_DIR = path.join(UPLOADS_DIR, "covers");

export async function adminStats(req, res, next) {
  try {
    const [users, books, activeBooks, totalDownloads] = await Promise.all([
      User.countDocuments({}),
      Book.countDocuments({}),
      Book.countDocuments({ status: "active" }),
      Book.aggregate([{ $group: { _id: null, total: { $sum: "$downloads" } } }]),
    ]);

    return res.json({
      users,
      books,
      activeBooks,
      totalDownloads: totalDownloads[0]?.total || 0,
    });
  } catch (err) {
    return next(err);
  }
}

export async function adminListBooks(req, res, next) {
  try {
    const books = await Book.find({})
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 })
      .limit(500);

    return res.json({ books });
  } catch (err) {
    return next(err);
  }
}

export async function adminDeleteBook(req, res, next) {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Livro não encontrado." });

    const filePath = path.join(BOOKS_DIR, book.file?.filename || "");
    const coverPath = path.join(COVERS_DIR, book.cover?.filename || "");

    await fs.unlink(filePath).catch(() => {});
    await fs.unlink(coverPath).catch(() => {});

    await User.updateMany(
      { favorites: book._id },
      { $pull: { favorites: book._id } }
    );

    await Book.deleteOne({ _id: book._id });

    return res.json({ ok: true, message: "Livro apagado com sucesso." });
  } catch (err) {
    return next(err);
  }
}

export async function adminListUsers(req, res, next) {
  try {
    const users = await User.find({})
      .select("name email role isBanned favorites createdAt")
      .sort({ createdAt: -1 })
      .limit(500);

    return res.json({ users });
  } catch (err) {
    return next(err);
  }
}

export async function adminToggleBan(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    user.isBanned = !user.isBanned;
    await user.save();

    return res.json({
      ok: true,
      message: user.isBanned ? "Usuário banido." : "Usuário desbanido.",
      user,
    });
  } catch (err) {
    return next(err);
  }
}

export async function adminToggleRole(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    user.role = user.role === "admin" ? "user" : "admin";
    await user.save();

    return res.json({
      ok: true,
      message: user.role === "admin" ? "Usuário promovido para admin." : "Usuário voltou para user.",
      user,
    });
  } catch (err) {
    return next(err);
  }
}