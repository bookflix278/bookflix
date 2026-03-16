/**
 * Gera capas SVG para livros já existentes no banco que estejam sem capa.
 * Uso:
 *   node scripts/backfillCovers.js
 *
 * Requisitos:
 *   - .env com MONGO_URI (ou DATABASE_URL) e (opcional) DB_NAME
 *   - Book model em src/models/Book.js (export default)
 *   - Pasta uploads/covers existirá ou será criada
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Book from "../src/models/Book.js";

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;
if (!MONGO_URI) {
  console.error("❌ Defina MONGO_URI (ou DATABASE_URL) no .env");
  process.exit(1);
}

const coversDir = path.resolve(process.cwd(), "uploads", "covers");
fs.mkdirSync(coversDir, { recursive: true });

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function safeName(s = "") {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function makeSvg({ title, author, category }) {
  const t = esc(title || "Sem título");
  const a = esc(author || "Autor desconhecido");
  const c = esc(category || "Livro");

  // Gradiente determinístico por texto
  const seed = (title || "") + "|" + (author || "");
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue}, 70%, 20%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 40) % 360}, 80%, 10%)"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>

  <rect width="600" height="900" rx="36" fill="url(#g)"/>
  <rect x="40" y="55" width="520" height="790" rx="26" fill="rgba(0,0,0,0.35)" filter="url(#shadow)"/>

  <text x="70" y="135" fill="rgba(255,255,255,0.82)" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700">${c}</text>

  <foreignObject x="70" y="185" width="460" height="520">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#fff;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:48px;font-weight:900;line-height:1.08;letter-spacing:-0.5px;">${t}</div>
      <div style="margin-top:26px;font-size:26px;opacity:0.9;">${a}</div>
    </div>
  </foreignObject>

  <text x="70" y="820" fill="rgba(255,255,255,0.6)" font-family="Arial, Helvetica, sans-serif" font-size="18">Capa gerada automaticamente</text>
</svg>`;
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Conectado ao MongoDB");

  const query = {
    $or: [
      { cover: { $exists: false } },
      { "cover.filename": { $exists: false } },
      { "cover.filename": null },
      { "cover.filename": "" },
    ],
  };

  const books = await Book.find(query).select("_id title author category cover").lean();
  console.log(`📚 Livros sem capa: ${books.length}`);

  let ok = 0;
  for (const b of books) {
    const slug = safeName(`${b.title || "livro"}-${b.author || "autor"}`) || String(b._id);
    const filename = `${slug}-${String(b._id).slice(-6)}.svg`;
    const filepath = path.join(coversDir, filename);

    const svg = makeSvg({ title: b.title, author: b.author, category: b.category });
    fs.writeFileSync(filepath, svg, "utf8");

    await Book.updateOne(
      { _id: b._id },
      {
        $set: {
          cover: {
            filename,
            mime: "image/svg+xml",
            size: Buffer.byteLength(svg, "utf8"),
          },
        },
      }
    );

    ok++;
    if (ok % 50 === 0) console.log(`... ${ok}/${books.length}`);
  }

  console.log(`✅ Capas geradas: ${ok}`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error("❌ Erro no backfill:", e);
  process.exit(1);
});
