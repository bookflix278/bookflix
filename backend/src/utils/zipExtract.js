import fs from "fs";
import path from "path";
import unzipper from "unzipper";
import Book from "../models/Book.js";

const BOOK_DIR = path.resolve("uploads/books");

export async function bulkUploadZip(req, res, next) {

  try {

    const zipFile = req.file;

    if (!zipFile) {
      return res.status(400).json({ error: "Arquivo ZIP não enviado." });
    }

    const extractPath = path.join(BOOK_DIR, "bulk");

    await fs.promises.mkdir(extractPath, { recursive: true });

    await fs
      .createReadStream(zipFile.path)
      .pipe(unzipper.Extract({ path: extractPath }))
      .promise();

    const files = await fs.promises.readdir(extractPath);

    const books = [];

    for (const file of files) {

      const ext = path.extname(file).toLowerCase();

      if (ext !== ".pdf" && ext !== ".epub") continue;

      const title = file.replace(ext, "");

      const book = await Book.create({
        title,
        author: "Desconhecido",
        description: "Importado automaticamente",
        category: "Geral",
        file: {
          filename: file
        },
        downloads: 0,
        status: "active"
      });

      books.push(book);

    }

    res.json({
      message: "Upload em massa concluído",
      total: books.length
    });

  } catch (err) {
    next(err);
  }

}