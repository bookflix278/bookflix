import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "backend/.env" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const booksDir = "backend/uploads/books_final";

function cleanTitle(fileName) {
  return fileName
    .replace(/\.(pdf|epub)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeName(fileName) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function run() {
  console.log("🔥 RECONSTRUINDO BIBLIOTECA...");

  const files = fs.readdirSync(booksDir);

  let uploaded = 0;

  for (const file of files) {
    const filePath = path.join(booksDir, file);
    const buffer = fs.readFileSync(filePath);

    const safeFile = `${Date.now()}-${safeName(file)}`;

    try {
      // upload arquivo
      const { error: uploadError } = await supabase.storage
        .from("books")
        .upload(safeFile, buffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        console.log("❌ upload erro:", file);
        continue;
      }

      const fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/books/${encodeURIComponent(safeFile)}`;

      // cria registro
      const { error: dbError } = await supabase.from("books").insert({
        title: cleanTitle(file),
        author: "Desconhecido",
        cover_url: null,
        file_url: fileUrl,
        category: "Livro",
      });

      if (dbError) {
        console.log("❌ DB erro:", file);
        continue;
      }

      console.log("✅", file);
      uploaded++;

    } catch (err) {
      console.log("❌ erro:", file);
    }
  }

  console.log("\n🎉 FINALIZADO");
  console.log("Total enviados:", uploaded);
}

run();