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

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY em backend/.env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function cleanTitle(text) {
  if (!text) return null;

  return String(text)
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\.(pdf|epub|mobi|azw3)$/i, "")
    .replace(/^[\W_]+|[\W_]+$/g, "")
    .trim()
    .slice(0, 140);
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

function getHashFromFilename(filename) {
  return filename.replace(/\.(pdf|epub)$/i, "");
}

function prettifyFallback(hash) {
  return `Documento ${hash.slice(0, 6).toUpperCase()}`;
}

function findGeneratedCover(hash) {
  if (!fs.existsSync(coversDir)) return null;

  const files = fs.readdirSync(coversDir);

  const exact = files.find((f) => {
    const lower = f.toLowerCase();
    return (
      lower === `${hash}.png` ||
      lower === `${hash}.jpg` ||
      lower === `${hash}.jpeg` ||
      lower === `${hash}-1.png` ||
      lower === `${hash}-1.jpg` ||
      lower === `${hash}-1.jpeg`
    );
  });
  if (exact) return exact;

  const prefixed = files.find((f) => f.toLowerCase().startsWith(hash.toLowerCase()));
  return prefixed || null;
}

function publicCoverUrl(fileName) {
  return `${supabaseUrl}/storage/v1/object/public/covers/${encodeURIComponent(fileName)}`;
}

async function extractTitleFromPdf(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);

    const metaTitle = cleanTitle(data?.info?.Title);
    if (metaTitle && !isBadTitle(metaTitle)) {
      return metaTitle;
    }

    const lines = String(data?.text || "")
      .split("\n")
      .map((line) => cleanTitle(line))
      .filter(Boolean)
      .filter((line) => line.length > 3);

    for (const line of lines.slice(0, 30)) {
      if (!isBadTitle(line)) {
        return line;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function updateBook(hash, payload) {
  const pdfPattern = `%${hash}.pdf`;
  const epubPattern = `%${hash}.epub`;

  let result = await supabase
    .from("books")
    .update(payload)
    .ilike("file_url", pdfPattern)
    .select("id,title,file_url");

  if (result.error) {
    console.log(`❌ Erro ao atualizar ${hash}: ${result.error.message}`);
    return false;
  }

  if (result.data && result.data.length > 0) {
    return true;
  }

  result = await supabase
    .from("books")
    .update(payload)
    .ilike("file_url", epubPattern)
    .select("id,title,file_url");

  if (result.error) {
    console.log(`❌ Erro ao atualizar ${hash}: ${result.error.message}`);
    return false;
  }

  if (result.data && result.data.length > 0) {
    return true;
  }

  console.log(`⚠️ Nenhum livro encontrado no banco para ${hash}`);
  return false;
}

async function run() {
  if (!fs.existsSync(booksDir)) {
    console.log(`❌ Pasta não encontrada: ${booksDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(booksDir)
    .filter((file) => /\.(pdf|epub)$/i.test(file));

  let ok = 0;
  let fail = 0;

  for (const file of files) {
    const hash = getHashFromFilename(file);
    const fullPath = path.join(booksDir, file);

    console.log(`\n📘 Processando: ${file}`);

    let title = null;
    let author = "Desconhecido";
    let category = "Book";

    if (/\.pdf$/i.test(file)) {
      title = await extractTitleFromPdf(fullPath);
    }

    if (!title || isBadTitle(title)) {
      title = prettifyFallback(hash);
    }

    const coverFile = findGeneratedCover(hash);
    const payload = {
      title,
      author,
      category,
    };

    if (coverFile) {
      payload.cover_url = publicCoverUrl(coverFile);
    }

    const success = await updateBook(hash, payload);

    if (success) {
      console.log(`✅ Atualizado: ${title}${coverFile ? " + capa" : ""}`);
      ok += 1;
    } else {
      fail += 1;
    }
  }

  console.log("\n🎉 FINALIZADO");
  console.log(`✅ Sucessos: ${ok}`);
  console.log(`❌ Falhas: ${fail}`);
}

run().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});