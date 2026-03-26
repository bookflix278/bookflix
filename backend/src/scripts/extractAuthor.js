import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "backend/.env" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function splitTitle(title) {
  if (!title) return { author: "Desconhecido", title };

  const parts = title.split(" - ");

  if (parts.length >= 2) {
    return {
      author: parts[0].trim(),
      title: parts.slice(1).join(" - ").trim()
    };
  }

  return {
    author: "Desconhecido",
    title
  };
}

async function run() {
  const { data: books } = await supabase.from("books").select("*");

  let updated = 0;

  for (const book of books) {
    const { author, title } = splitTitle(book.title);

    await supabase
      .from("books")
      .update({
        author,
        title
      })
      .eq("id", book.id);

    console.log(`✅ ${author} → ${title}`);
    updated++;
  }

  console.log("\nFINALIZADO");
  console.log("Atualizados:", updated);
}

run();