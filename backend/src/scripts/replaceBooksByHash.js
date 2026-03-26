import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "backend/.env" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const oldBooksDir = "backend/uploads/books";
const newBooksDir = "backend/uploads/books_final";

function md5File(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function cleanTitle(fileName) {
  return fileName
    .replace(/\.(pdf|epub)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeStorageName(fileName) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHashFromFileUrl(fileUrl = "") {
  const match = fileUrl.match(/\/books\/([^/?]+)\.(pdf|epub)/i);
  return match ? match[1] : null;
}

async function getAllBooksFromDb() {
  const all = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("books")
      .select("id,title,file_url,cover_url")
      .range(from, to);

    if (error) {
      throw new Error(`Erro buscando books: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    all.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function uploadNewFileToSupabase(fileName, filePath) {
  const buffer = fs.readFileSync(filePath);
  const storageName = `${Date.now()}-${safeStorageName(fileName)}`;

  const { error } = await supabase.storage
    .from("books")
    .upload(storageName, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    throw new Error(`Erro upload ${fileName}: ${error.message}`);
  }

  return `${process.env.SUPABASE_URL}/storage/v1/object/public/books/${encodeURIComponent(storageName)}`;
}

async function run() {
  console.log("🚀 Iniciando substituição segura por hash...");

  if (!fs.existsSync(oldBooksDir)) {
    throw new Error(`Pasta não encontrada: ${oldBooksDir}`);
  }

  if (!fs.existsSync(newBooksDir)) {
    throw new Error(`Pasta não encontrada: ${newBooksDir}`);
  }

  const oldFiles = fs.readdirSync(oldBooksDir).filter((f) => /\.pdf$/i.test(f));
  const newFiles = fs.readdirSync(newBooksDir).filter((f) => /\.pdf$/i.test(f));

  if (!oldFiles.length) throw new Error("Nenhum PDF encontrado em backend/uploads/books");
  if (!newFiles.length) throw new Error("Nenhum PDF encontrado em backend/uploads/books_final");

  console.log(`📚 PDFs antigos: ${oldFiles.length}`);
  console.log(`🆕 PDFs novos: ${newFiles.length}`);

  console.log("\n1) Calculando hash dos arquivos antigos...");
  const oldHashMap = new Map();
  for (const file of oldFiles) {
    const fullPath = path.join(oldBooksDir, file);
    const hash = md5File(fullPath);
    oldHashMap.set(hash, {
      file,
      fullPath,
      oldNameWithoutExt: file.replace(/\.pdf$/i, ""),
    });
  }

  console.log("2) Calculando hash dos arquivos novos...");
  const newHashMap = new Map();
  for (const file of newFiles) {
    const fullPath = path.join(newBooksDir, file);
    const hash = md5File(fullPath);
    newHashMap.set(hash, {
      file,
      fullPath,
      title: cleanTitle(file),
    });
  }

  console.log("3) Lendo tabela books...");
  const dbBooks = await getAllBooksFromDb();
  console.log(`📦 Registros no banco: ${dbBooks.length}`);

  let matched = 0;
  let updated = 0;
  let notFoundInDb = 0;
  let notMatchedByContent = 0;

  for (const [contentHash, newInfo] of newHashMap.entries()) {
    const oldInfo = oldHashMap.get(contentHash);

    if (!oldInfo) {
      console.log(`⚠️ Sem correspondente antigo por conteúdo: ${newInfo.file}`);
      notMatchedByContent++;
      continue;
    }

    matched++;

    const oldHashName = oldInfo.oldNameWithoutExt;
    const dbBook = dbBooks.find((b) => (b.file_url || "").includes(`${oldHashName}.pdf`));

    if (!dbBook) {
      console.log(`⚠️ Livro não encontrado no banco para hash antigo: ${oldHashName}`);
      notFoundInDb++;
      continue;
    }

    console.log(`\n📘 Casado por conteúdo:`);
    console.log(`   antigo: ${oldInfo.file}`);
    console.log(`   novo:   ${newInfo.file}`);
    console.log(`   banco:  ${dbBook.id}`);

    try {
      const newFileUrl = await uploadNewFileToSupabase(newInfo.file, newInfo.fullPath);

      const { error: updateError } = await supabase
        .from("books")
        .update({
          title: newInfo.title,
          file_url: newFileUrl,
        })
        .eq("id", dbBook.id);

      if (updateError) {
        console.log(`❌ Erro ao atualizar DB: ${updateError.message}`);
        continue;
      }

      console.log(`✅ Atualizado: ${newInfo.title}`);
      updated++;
    } catch (err) {
      console.log(`❌ Falha em ${newInfo.file}: ${err.message}`);
    }
  }

  console.log("\n🎉 FINALIZADO");
  console.log(`✅ Casados por conteúdo: ${matched}`);
  console.log(`✅ Atualizados no banco: ${updated}`);
  console.log(`⚠️ Sem correspondente no banco: ${notFoundInDb}`);
  console.log(`⚠️ Sem correspondente por conteúdo: ${notMatchedByContent}`);
}

run().catch((err) => {
  console.error("❌ Erro fatal:", err.message);
  process.exit(1);
});