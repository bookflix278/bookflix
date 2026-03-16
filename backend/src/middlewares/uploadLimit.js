import Book from "../models/Book.js";

export async function limitUploadsPerHour(req, res, next) {
  const since = new Date(Date.now() - 60 * 60 * 1000);

  const count = await Book.countDocuments({
    uploadedBy: req.user.id,
    createdAt: { $gte: since },
  });

  if (count >= 5) {
    return res.status(429).json({ error: "Limite de upload atingido (5 por hora)." });
  }

  return next();
}