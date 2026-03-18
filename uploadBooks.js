import dotenv from "dotenv"
dotenv.config()

import fs from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const booksFolder = "./backend/uploads/books"

async function uploadBooks() {
  const files = fs.readdirSync(booksFolder)

  for (const file of files) {
    const filePath = path.join(booksFolder, file)
    const fileBuffer = fs.readFileSync(filePath)

    console.log("Uploading:", file)

    const { data, error } = await supabase.storage
      .from("books")
      .upload(file, fileBuffer)

    if (error) {
      console.log("Error:", error)
      continue
    }

    const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/books/${file}`

    await supabase.from("books").insert({
      title: file,
      author: "Unknown",
      category: "Book",
      description: "",
      cover_url: "",
      file_url: url,
      file_type: "pdf"
    })

    console.log("Added to database:", file)
  }
}

uploadBooks()