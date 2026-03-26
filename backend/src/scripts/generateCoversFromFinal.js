import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-poppler";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "backend/.env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const booksDir = path.resolve(__dirname, "../../uploads/books_final");
const coversDir = path.resolve(__dirname, "../../uploads/covers_final");

if (!fs.existsSync(coversDir)) {
  fs.mkdirSync(coversDir, { recursive: true });
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function cleanTitle(fileName) {
  return fileName
    .replace(/\.(pdf|epub)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function safeName(fileName) {
  return fileName
    .replace(/[^\w]/g, "_")
    .toLowerCase();
}

function fallbackCover(title) {
  return `https://placehold.co/300x450/0f172a/ffffff?text=${encodeURIComponent(
    title.substring(0, 40)
  )}`;
}

async function processBook(file) {
  if (!file.toLowerCase().endsWith(".pdf")) return;

  const filePath = path.join(booksDir, file);
  const title = cleanTitle(file);
  const base = safeName(file);

  const opts = {
    format: "png",
    out_dir: coversDir,
    out_prefix: base,
    page: 1,
  };

  let coverUrl = null;

  try {
    await pdf.convert(filePath, opts);

    const files = fs.readdirSync(coversDir);
    const generated = files.find((f) => f.startsWith(base));

    if (generated) {
      const imgPath = path.join(coversDir, generated);
      const buffer = fs.readFileSync(imgPath);

      const { error } = await supabase.storage
        .from("covers")
        .upload(generated, buffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (!error) {
        coverUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/covers/${generated}`;
      }
    }
  } catch (err) {
    console.log(`⚠️ Falhou PDF: ${file}`);
  }

  // fallback se não gerou capa
  if (!coverUrl) {
    coverUrl = fallbackCover(title);
  }

  await supabase
    .from("books")
    .update({ cover_url: coverUrl })
    .eq("title", title);

  console.log(`✔ ${title}`);
}

async function run() {
  const files = fs.readdirSync(booksDir);

  for (const file of files) {
    await processBook(file);
  }

  console.log("🚀 FINALIZADO");
}

run();