import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "backend/.env" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function formatTitle(title) {
  if (!title) return title;

  return title
    .toLowerCase()
    .replace(/\b\w/g, l => l.toUpperCase()) // capitaliza
    .replace(/\s+/g, " ")
    .trim();
}

async function run() {
  const { data: books } = await supabase.from("books").select("*");

  let updated = 0;

  for (const book of books) {
    const newTitle = formatTitle(book.title);

    if (newTitle !== book.title) {
      await supabase
        .from("books")
        .update({ title: newTitle })
        .eq("id", book.id);

      console.log(`✅ ${book.title} → ${newTitle}`);
      updated++;
    }
  }

  console.log("\nFINALIZADO");
  console.log("Atualizados:", updated);
}

run();