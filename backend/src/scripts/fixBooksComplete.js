import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// 🔥 Lista de autores comuns (você pode expandir depois)
const knownAuthors = [
  "ERICO VERISSIMO",
  "ZYG MUNT BAUMAN",
  "COLLEEN HOOVER",
  "JULIA JAMES",
  "LYNNE GRAHAM",
  "KATE WALKER",
  "SHERRY WOODS",
  "BARBARA CARTLAND",
  "PAULO COELHO",
  "MACHADO DE ASSIS",
  "STEPHEN KING",
  "GEORGE ORWELL"
]

// 🔥 limpa nome do arquivo
function cleanName(name) {
  return name
    .replace(".pdf", "")
    .replace(/_/g, " ")
    .replace(/\d{6,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// 🔥 tenta detectar autor
function detectAuthor(title) {
  const upper = title.toUpperCase()

  // 1. tenta pelos conhecidos
  for (const author of knownAuthors) {
    if (upper.includes(author)) {
      return author
    }
  }

  // 2. tenta pegar primeiras palavras como autor
  const words = title.split(" ")

  if (words.length >= 2) {
    return (words[0] + " " + words[1]).toUpperCase()
  }

  return "Desconhecido"
}

// 🔥 remove autor do título
function removeAuthorFromTitle(title, author) {
  return title.replace(new RegExp(author, "i"), "").trim()
}

async function run() {
  const { data: books } = await supabase
    .from('books')
    .select('*')

  let count = 0

  for (const book of books) {
    let title = cleanName(book.title)

    const author = detectAuthor(title)
    title = removeAuthorFromTitle(title, author)

    // fallback bonito
    if (!title || title.length < 3) {
      title = "Livro sem título"
    }

    await supabase
      .from('books')
      .update({
        title,
        author
      })
      .eq('id', book.id)

    console.log(`✔ ${author} - ${title}`)
    count++
  }

  console.log(`\n🔥 FINALIZADO: ${count} livros atualizados`)
}

run()