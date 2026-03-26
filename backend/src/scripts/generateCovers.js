import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-poppler";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "backend/.env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const booksDir = path.resolve(__dirname, "../../uploads/books");
const coversDir = path.resolve(__dirname, "../../uploads/covers");

if (!fs.existsSync(coversDir)) {
  fs.mkdirSync(coversDir, { recursive: true });
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function findGeneratedCover(baseName) {
  const files = fs.readdirSync(coversDir);

  // procura qualquer png/jpg que comece com o nome do arquivo
  const found = files.find((f) => {
    const lower = f.toLowerCase();
    return (
      lower.startsWith(baseName.toLowerCase()) &&
      (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
    );
  });

  return found ? path.join(coversDir, found) : null;
}

async function generateCover(file) {
  const filePath = path.join(booksDir, file);
  const name = file.replace(/\.(pdf|epub)$/i, "");

  if (!file.toLowerCase().endsWith(".pdf")) {
    console.log(`⏭ Pulando (não é PDF): ${file}`);
    return;
  }

  const opts = {
    format: "png",
    out_dir: coversDir,
    out_prefix: name,
    page: 1,
  };

  try {
    console.log(`📘 Gerando capa: ${file}`);
    await pdf.convert(filePath, opts);

    const generatedPath = findGeneratedCover(name);

    if (!generatedPath || !fs.existsSync(generatedPath)) {
      console.log(`❌ Não achei a imagem gerada para: ${file}`);
      return;
    }

    const generatedFileName = path.basename(generatedPath);
    const buffer = fs.readFileSync(generatedPath);

    const { error: uploadError } = await supabase.storage
      .from("covers")
      .upload(generatedFileName, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.log(`❌ Erro no upload (${file}): ${uploadError.message}`);
      return;
    }

    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/covers/${generatedFileName}`;

    const { error: dbError } = await supabase
      .from("books")
      .update({ cover_url: publicUrl })
      .ilike("file_url", `%${name}%`);

    if (dbError) {
      console.log(`❌ Erro ao atualizar banco (${file}): ${dbError.message}`);
      return;
    }

    console.log(`✅ Capa gerada: ${file}`);
  } catch (err) {
    console.log(`❌ Erro ao gerar capa (${file}): ${err.message}`);
  }
}

async function run() {
  if (!fs.existsSync(booksDir)) {
    console.log(`❌ Pasta não encontrada: ${booksDir}`);
    return;
  }

  const files = fs.readdirSync(booksDir);

  for (const file of files) {
    await generateCover(file);
  }

  console.log("🎉 FINALIZADO");
}

run();