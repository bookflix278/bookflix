import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// 🔥 resolve problema do pdf-parse
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

// 🔥 resolve __dirname no ESModules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔥 caminhos corretos AUTOMÁTICOS
const booksFolder = path.resolve(__dirname, "../../uploads/books");
const coversFolder = path.resolve(__dirname, "../../uploads/covers");

// 🔥 supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔥 limpar título
function cleanTitle(text) {
  if (!text) return null;

  return String(text)
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/^[\W_]+|[\W_]+$/g, "")
    .trim()
    .slice(0, 120);
}

// 🔥 extrair título do PDF
async function extractTitle(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);

    // 1. metadata
    const meta = cleanTitle(data?.info?.Title);
    if (meta && meta.length > 2) return meta;

    // 2. primeira linha útil
    const lines = data.text.split("\n");

    for (let line of lines) {
      line = cleanTitle(line);
      if (line && line.length > 3) return line;
    }

    return null;
  } catch {
    return null;
  }
}

// 🔥 rodar script
async function run() {
  console.log("🚀 Iniciando...\n");

  const files = fs.readdirSync(booksFolder);

  for (const file of files) {
    if (!file.endsWith(".pdf")) continue;

    const hash = file.replace(".pdf", "");
    const filePath = path.join(booksFolder, file);

    console.log("📘 Processando:", file);

    const title =
      (await extractTitle(filePath)) || `Livro ${hash.slice(0, 6)}`;

    const coverPath = path.join(coversFolder, `${hash}.jpg`);
    const coverUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/covers/${hash}.jpg`;

    const updateData = {
      title,
      author: "Desconhecido",
      category: "Book",
    };

    if (fs.existsSync(coverPath)) {
      updateData.cover_url = coverUrl;
    }

    const { error } = await supabase
      .from("books")
      .update(updateData)
      .ilike("file_url", `%${hash}.pdf`);

    if (error) {
      console.log("❌ Erro:", error.message);
    } else {
      console.log("✅ Atualizado:", title);
    }
  }

  console.log("\n🎉 FINALIZADO");
}

run();