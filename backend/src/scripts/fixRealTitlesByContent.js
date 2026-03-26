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
const realBooksDir = "backend/uploads/books_final";

// false = corrige só o nome
// true = corrige nome e também substitui o arquivo no Supabase
const REPLACE_STORAGE_FILE = false;

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

async function getAllBooks() {
  const all = [];
  let from = 0;
  const size = 1000;

  while (true) {
    const to = from + size - 1;
    const { data, error } = await supabase
      .from("books")
      .select("id,title,file_url")
      .range(from, to);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < size) break;
    from += size;
  }

  return all;
}

async function uploadReplacementFile(fileName, filePath) {
  const buffer = fs.readFileSync(filePath);
  const storageName = `${Date.now()}-${safeStorageName(fileName)}`;

  const { error } = await supabase.storage
    .from("books")
    .upload(storageName, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  return `${process.env.SUPABASE_URL}/storage/v1/object/public/books/${encodeURIComponent(storageName)}`;
}

async function run() {
  console.log("🚀 Iniciando correção dos nomes reais por conteúdo...");

  if (!fs.existsSync(oldBooksDir)) throw new Error(`Pasta não encontrada: ${oldBooksDir}`);
  if (!fs.existsSync(realBooksDir)) throw new Error(`Pasta não encontrada: ${realBooksDir}`);

  const oldFiles = fs.readdirSync(oldBooksDir).filter(f => /\.pdf$/i.test(f));
  const realFiles = fs.readdirSync(realBooksDir).filter(f => /\.pdf$/i.test(f));

  console.log(`📚 Antigos: ${oldFiles.length}`);
  console.log(`📝 Reais: ${realFiles.length}`);

  const oldHashMap = new Map();
  for (const file of oldFiles) {
    const fullPath = path.join(oldBooksDir, file);
    const md5 = md5File(fullPath);
    oldHashMap.set(md5, {
      file,
      fullPath,
      oldHashName: file.replace(/\.pdf$/i, ""),
    });
  }

  const realHashMap = new Map();
  for (const file of realFiles) {
    const fullPath = path.join(realBooksDir, file);
    const md5 = md5File(fullPath);
    realHashMap.set(md5, {
      file,
      fullPath,
      realTitle: cleanTitle(file),
    });
  }

  const dbBooks = await getAllBooks();

  let updated = 0;
  let notFoundInDb = 0;
  let noMatch = 0;

  for (const [md5, realInfo] of realHashMap.entries()) {
    const oldInfo = oldHashMap.get(md5);

    if (!oldInfo) {
      console.log(`⚠️ Sem correspondente por conteúdo: ${realInfo.file}`);
      noMatch++;
      continue;
    }

    const dbBook = dbBooks.find(book =>
      (book.file_url || "").includes(`${oldInfo.oldHashName}.pdf`)
    );

    if (!dbBook) {
      console.log(`⚠️ Não achei no banco: ${oldInfo.oldHashName}.pdf`);
      notFoundInDb++;
      continue;
    }

    const payload = {
      title: realInfo.realTitle,
    };

    if (REPLACE_STORAGE_FILE) {
      try {
        const newFileUrl = await uploadReplacementFile(realInfo.file, realInfo.fullPath);
        payload.file_url = newFileUrl;
      } catch (err) {
        console.log(`❌ Erro ao subir arquivo novo (${realInfo.file}): ${err.message}`);
        continue;
      }
    }

    const { error } = await supabase
      .from("books")
      .update(payload)
      .eq("id", dbBook.id);

    if (error) {
      console.log(`❌ Erro ao atualizar ${realInfo.file}: ${error.message}`);
      continue;
    }

    console.log(`✅ ${dbBook.id} -> ${realInfo.realTitle}`);
    updated++;
  }

  console.log("\\n🎉 FINALIZADO");
  console.log(`✅ Atualizados: ${updated}`);
  console.log(`⚠️ Sem match por conteúdo: ${noMatch}`);
  console.log(`⚠️ Sem registro no banco: ${notFoundInDb}`);
}
run().catch(err => {
  console.error("❌ Erro fatal:", err.message);
  process.exit(1);
});