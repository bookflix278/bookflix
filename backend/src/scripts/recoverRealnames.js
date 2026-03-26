import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "backend/.env" });

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const booksDir = path.resolve(__dirname, "../../uploads/books");
const coversDir = path.resolve(__dirname, "../../uploads/covers");
const pendingCsv = path.resolve(__dirname, "../../uploads/pending-title-review.csv");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const googleBooksApiKey = process.env.GOOGLE_BOOKS_API_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY em backend/.env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function cleanText(text) {
  if (!text) return null;
  return String(text)
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\.(pdf|epub)$/i, "")
    .replace(/^[\W_]+|[\W_]+$/g, "")
    .trim()
    .slice(0, 180);
}

function isHashLike(text = "") {
  return /^[a-f0-9]{20,}$/i.test(String(text).trim());
}

function isBadTitle(text = "") {
  const t = String(text || "").trim();
  return (
    !t ||
    t.length < 4 ||
    isHashLike(t) ||
    /^livro\s+[a-f0-9]{4,}$/i.test(t) ||
    /^documento\s+[a-f0-9]{4,}$/i.test(t) ||
    /^untitled$/i.test(t) ||
    /^document$/i.test(t)
  );
}

function hashFromFilename(filename) {
  return filename.replace(/\.(pdf|epub)$/i, "");
}

function fallbackTitle(hash) {
  return `Documento ${hash.slice(0, 6).toUpperCase()}`;
}

function findGeneratedCover(hash) {
  if (!fs.existsSync(coversDir)) return null;
  const files = fs.readdirSync(coversDir);

  const exact = files.find((f) => {
    const x = f.toLowerCase();
    return (
      x === `${hash}.png` ||
      x === `${hash}.jpg` ||
      x === `${hash}.jpeg` ||
      x === `${hash}-1.png` ||
      x === `${hash}-1.jpg` ||
      x === `${hash}-1.jpeg`
    );
  });
  if (exact) return exact;

  const prefixed = files.find((f) => f.toLowerCase().startsWith(hash.toLowerCase()));
  return prefixed || null;
}

function publicCoverUrl(fileName) {
  return `${supabaseUrl}/storage/v1/object/public/covers/${encodeURIComponent(fileName)}`;
}

async function extractPdfHints(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);

    const metaTitle = cleanText(data?.info?.Title);
    const lines = String(data?.text || "")
      .split("\n")
      .map((line) => cleanText(line))
      .filter(Boolean)
      .filter((line) => line.length > 3)
      .slice(0, 20);

    return {
      metaTitle: metaTitle && !isBadTitle(metaTitle) ? metaTitle : null,
      lines,
    };
  } catch {
    return { metaTitle: null, lines: [] };
  }
}

function scoreGoogleCandidate(candidate, hints) {
  let score = 0;
  const title = cleanText(candidate?.volumeInfo?.title || "");
  const authors = candidate?.volumeInfo?.authors || [];

  if (!title) return -1;
  if (hints.metaTitle && title.toLowerCase() === hints.metaTitle.toLowerCase()) score += 100;
  if (hints.metaTitle && title.toLowerCase().includes(hints.metaTitle.toLowerCase())) score += 40;

  for (const line of hints.lines.slice(0, 5)) {
    if (title.toLowerCase() === line.toLowerCase()) score += 60;
    else if (title.toLowerCase().includes(line.toLowerCase()) || line.toLowerCase().includes(title.toLowerCase())) score += 20;
  }

  if (authors.length) score += 5;
  if (candidate?.volumeInfo?.imageLinks?.thumbnail || candidate?.volumeInfo?.imageLinks?.smallThumbnail) score += 5;

  return score;
}

async function searchGoogleBooks(hints) {
  const queries = [];
  if (hints.metaTitle) queries.push(`intitle:${hints.metaTitle}`);
  for (const line of hints.lines.slice(0, 3)) {
    if (!queries.includes(`intitle:${line}`)) queries.push(`intitle:${line}`);
  }

  for (const q of queries) {
    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    url.searchParams.set("q", q);
    url.searchParams.set("maxResults", "5");
    if (googleBooksApiKey) url.searchParams.set("key", googleBooksApiKey);

    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) continue;

      const ranked = items
        .map((item) => ({ item, score: scoreGoogleCandidate(item, hints) }))
        .sort((a, b) => b.score - a.score);

      const best = ranked[0];
      if (best && best.score >= 40) {
        const info = best.item.volumeInfo || {};
        return {
          title: cleanText(info.title),
          author: Array.isArray(info.authors) && info.authors.length ? info.authors[0] : "Desconhecido",
          category: Array.isArray(info.categories) && info.categories.length ? info.categories[0] : "Book",
          cover_url: info.imageLinks?.thumbnail?.replace("http://", "https://") ||
                     info.imageLinks?.smallThumbnail?.replace("http://", "https://") ||
                     null,
          source: "google",
          score: best.score,
        };
      }
    } catch {}
  }

  return null;
}

function scoreOpenLibraryCandidate(doc, hints) {
  let score = 0;
  const title = cleanText(doc?.title || "");
  if (!title) return -1;

  if (hints.metaTitle && title.toLowerCase() === hints.metaTitle.toLowerCase()) score += 80;
  if (hints.metaTitle && title.toLowerCase().includes(hints.metaTitle.toLowerCase())) score += 35;

  for (const line of hints.lines.slice(0, 5)) {
    if (title.toLowerCase() === line.toLowerCase()) score += 50;
    else if (title.toLowerCase().includes(line.toLowerCase()) || line.toLowerCase().includes(title.toLowerCase())) score += 15;
  }

  if (doc.cover_i) score += 5;
  if (doc.author_name?.length) score += 5;

  return score;
}

async function searchOpenLibrary(hints) {
  const queries = [];
  if (hints.metaTitle) queries.push(hints.metaTitle);
  for (const line of hints.lines.slice(0, 3)) {
    if (!queries.includes(line)) queries.push(line);
  }

  for (const q of queries) {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("title", q);
    url.searchParams.set("limit", "5");

    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const docs = Array.isArray(data.docs) ? data.docs : [];
      if (!docs.length) continue;

      const ranked = docs
        .map((doc) => ({ doc, score: scoreOpenLibraryCandidate(doc, hints) }))
        .sort((a, b) => b.score - a.score);

      const best = ranked[0];
      if (best && best.score >= 35) {
        const doc = best.doc;
        return {
          title: cleanText(doc.title),
          author: Array.isArray(doc.author_name) && doc.author_name.length ? doc.author_name[0] : "Desconhecido",
          category: "Book",
          cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
          source: "openlibrary",
          score: best.score,
        };
      }
    } catch {}
  }

  return null;
}

async function updateBook(hash, payload) {
  const patterns = [`%${hash}.pdf`, `%${hash}.epub`];

  for (const pattern of patterns) {
    const { data, error } = await supabase
      .from("books")
      .update(payload)
      .ilike("file_url", pattern)
      .select("id");

    if (error) {
      console.log(`❌ Erro ao atualizar ${hash}: ${error.message}`);
      return false;
    }

    if (data && data.length > 0) return true;
  }

  return false;
}

async function run() {
  if (!fs.existsSync(booksDir)) {
    console.error(`❌ Pasta não encontrada: ${booksDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(booksDir).filter((f) => /\.(pdf|epub)$/i.test(f));
  const pending = [];
  let ok = 0;
  let fail = 0;

  for (const file of files) {
    const hash = hashFromFilename(file);
    const filePath = path.join(booksDir, file);

    console.log(`\n📘 Processando: ${file}`);

    const hints = /\.pdf$/i.test(file)
      ? await extractPdfHints(filePath)
      : { metaTitle: null, lines: [] };

    let found = await searchGoogleBooks(hints);
    if (!found) found = await searchOpenLibrary(hints);

    let title = found?.title;
    let author = found?.author || "Desconhecido";
    let category = found?.category || "Book";

    if (!title || isBadTitle(title)) {
      title = hints.metaTitle || hints.lines.find((x) => !isBadTitle(x)) || fallbackTitle(hash);
    }

    let cover_url = found?.cover_url || null;

    const localCover = findGeneratedCover(hash);
    if (localCover) {
      cover_url = publicCoverUrl(localCover);
    }

    const payload = { title, author, category };
    if (cover_url) payload.cover_url = cover_url;

    const success = await updateBook(hash, payload);

    if (success) {
      console.log(`✅ Atualizado: ${title}${found ? ` [${found.source}]` : ""}${localCover ? " + capa local" : ""}`);
      ok += 1;
    } else {
      console.log(`⚠️ Não achei esse livro no banco: ${hash}`);
      fail += 1;
    }

    if (!found || isBadTitle(title)) {
      pending.push({
        hash,
        file,
        guessed_title: title,
        meta_title: hints.metaTitle || "",
        first_line: hints.lines[0] || "",
      });
    }
  }

  const csvLines = [
    "hash,file,guessed_title,meta_title,first_line",
    ...pending.map((row) =>
      [row.hash, row.file, row.guessed_title, row.meta_title, row.first_line]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];
  fs.writeFileSync(pendingCsv, csvLines.join("\n"), "utf8");

  console.log("\n🎉 FINALIZADO");
  console.log(`✅ Sucessos: ${ok}`);
  console.log(`❌ Falhas: ${fail}`);
  console.log(`📝 Revisão manual: ${pendingCsv}`);
}

run().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});