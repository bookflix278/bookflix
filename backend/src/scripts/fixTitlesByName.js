import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "backend/.env" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const realBooksDir = "backend/uploads/books_final";

function clean(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  let matches = 0;
  for (let word of a.split(" ")) {
    if (b.includes(word)) matches++;
  }
  return matches;
}

async function run() {
  console.log("🚀 Corrigindo nomes por similaridade...");

  const files = fs.readdirSync(realBooksDir);

  const cleanedMap = files.map(file => ({
    file,
    title: file.replace(/\.(pdf|epub)$/i, ""),
    clean: clean(file)
  }));

  const { data: books, error } = await supabase
    .from("books")
    .select("*");

  if (error) throw new Error(error.message);

  let updated = 0;

  for (const book of books) {
    const currentTitle = clean(book.title || "");

    let bestMatch = null;
    let bestScore = 0;

    for (const item of cleanedMap) {
      const score = similarity(currentTitle, item.clean);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    // só aceita se tiver alguma semelhança
    if (bestMatch && bestScore >= 2) {
      const { error } = await supabase
        .from("books")
        .update({ title: bestMatch.title })
        .eq("id", book.id);

      if (!error) {
        console.log(`✅ ${book.title} → ${bestMatch.title}`);
        updated++;
      }
    }
  }

  console.log("\n🎉 FINALIZADO");
  console.log(`Atualizados: ${updated}`);
}

run();