import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "./backend/.env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coversFolder = path.resolve(__dirname, "../../uploads/covers");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function extractHashFromFileUrl(fileUrl) {
  if (!fileUrl) return null;
  const match = fileUrl.match(/\/books\/([^/]+)\.pdf/i);
  return match ? match[1] : null;
}

function buildCoverIndex() {
  const index = new Map();
  if (!fs.existsSync(coversFolder)) return index;
  const files = fs.readdirSync(coversFolder).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));

  for (const file of files) {
    const clean = file.replace(/\.(jpg|jpeg|png|webp)$/i, "");
    const base = clean.replace(/\.\d+$/, "");
    const first6 = base.slice(0, 6).toLowerCase();
    if (!index.has(base.toLowerCase())) index.set(base.toLowerCase(), file);
    if (first6 && !index.has(first6)) index.set(first6, file);
  }

  return index;
}

function makeCoverUrl(filename) {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/covers/${filename}`;
}

async function run() {
  console.log("Iniciando correção das capas...");
  const coverIndex = buildCoverIndex();

  const { data: books, error } = await supabase
    .from("books")
    .select("id, file_url, cover_url, title")
    .limit(5000);

  if (error) {
    console.error("Erro ao buscar livros:", error.message);
    return;
  }

  for (const book of books) {
    const hash = extractHashFromFileUrl(book.file_url);
    if (!hash) {
      console.log("Sem hash:", book.title);
      continue;
    }

    const match = coverIndex.get(hash.toLowerCase()) || coverIndex.get(hash.slice(0, 6).toLowerCase());
    if (!match) {
      console.log("Sem capa correspondente:", book.title || hash);
      continue;
    }

    const coverUrl = makeCoverUrl(match);
    const { error: updateError } = await supabase
      .from("books")
      .update({ cover_url: coverUrl })
      .eq("id", book.id);

    if (updateError) {
      console.log("Erro ao atualizar:", book.id, updateError.message);
    } else {
      console.log("Capa ligada:", book.title || hash, "->", match);
    }
  }

  console.log("Finalizado.");
}

run();
