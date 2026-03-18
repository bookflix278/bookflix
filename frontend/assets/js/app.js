const CONFIG = window.BOOKFLIX_CONFIG || {};
const SUPABASE_URL = CONFIG.SUPABASE_URL || "";
const SUPABASE_KEY = CONFIG.SUPABASE_ANON_KEY || "";

const rowsEl = document.getElementById("rows");
const searchInput = document.getElementById("searchInput");
const heroBg = document.getElementById("heroBg");
const heroTitle = document.getElementById("heroTitle");
const heroMeta = document.getElementById("heroMeta");
const heroDesc = document.getElementById("heroDesc");
const heroActions = document.getElementById("heroActions");
const topActions = document.getElementById("topActions");

let searchTimer = null;
let heroTimer = null;
let heroBooks = [];
let heroIndex = 0;
let currentBooks = [];

function getUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(v) {
  return String(v || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeBook(book) {
  return {
    id: book.id,
    title: book.title || "Sem título",
    author: book.author || "Autor desconhecido",
    category: book.category || "Geral",
    description: book.description || "Sem descrição.",
    cover_url: book.cover_url || "",
    file_url: book.file_url || "",
    file_type: book.file_type || "pdf",
    created_at: book.created_at || null,
  };
}

function coverUrl(book) {
  return book?.cover_url || "";
}

function goUpload() {
  location.href = "upload.html";
}

function goBulk() {
  location.href = "bulk.html";
}

function goLogin() {
  location.href = "login.html";
}

function goAdmin() {
  location.href = "admin.html";
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  location.href = "login.html";
}

function sortAlpha(a, b) {
  return normalizeText(a).localeCompare(normalizeText(b), "pt-BR", {
    sensitivity: "base",
  });
}

function firstLetterBucket(title = "") {
  const t = normalizeText(title);
  const ch = (t[0] || "#").toUpperCase();
  if ("ABCDE".includes(ch)) return "A–E";
  if ("FGHIJ".includes(ch)) return "F–J";
  if ("KLMNO".includes(ch)) return "K–O";
  if ("PQRST".includes(ch)) return "P–T";
  if ("UVWXYZ".includes(ch)) return "U–Z";
  return "Outros títulos";
}

function ensureTopButtons() {
  const user = getUser();
  const buttons = topActions?.querySelectorAll("button") || [];
  buttons.forEach((btn) => {
    if (btn.textContent === "Sair") {
      btn.style.display = user ? "inline-flex" : "none";
    }
    if (btn.textContent === "Entrar") {
      btn.style.display = user ? "none" : "inline-flex";
    }
    if (btn.textContent === "Admin") {
      btn.style.display = user?.role === "admin" ? "inline-flex" : "none";
    }
  });
}

async function fetchBooks() {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_KEY.includes("COLE_AQUI")) {
    throw new Error("Abra assets/js/config.js e cole sua anon public key do Supabase.");
  }

  const url = `${SUPABASE_URL}/rest/v1/books?select=*&order=created_at.desc.nullslast&limit=5000`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: "application/json",
    },
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) {
    throw new Error(data?.message || data?.error_description || "Não foi possível carregar os livros.");
  }

  return data.map(normalizeBook);
}

function getHeroCandidates(books) {
  return [...books].filter((b) => b?.title).slice(0, 10);
}

function renderHeroBook(book) {
  const user = getUser();

  if (!book) {
    heroTitle.textContent = "Bookflix";
    heroMeta.textContent = "Biblioteca digital pública";
    heroDesc.textContent = "Nenhum livro encontrado.";
    heroActions.innerHTML = `<button class="btn btn-primary" onclick="goUpload()">Enviar primeiro livro</button>`;
    heroBg.style.backgroundImage = "";
    return;
  }

  heroBg.style.backgroundImage = book.cover_url ? `url('${book.cover_url}')` : "";
  heroTitle.textContent = book.title;
  heroMeta.textContent = `${user?.name ? `Olá, ${user.name}` : "Biblioteca digital"} • ${book.author} • ${book.category}`;
  heroDesc.textContent = (book.description || "Sem descrição.").slice(0, 240);
  heroActions.innerHTML = `
    <button class="btn btn-primary" onclick="openModalById('${book.id}')">Ver detalhes</button>
    <button class="btn" onclick="openBook('${book.file_url}')">Ler livro</button>
    <button class="btn" onclick="downloadBook('${book.file_url}','${escapeHtml(book.title)}')">Baixar</button>
  `;
}

function startHeroRotation(books) {
  heroBooks = getHeroCandidates(books);
  heroIndex = 0;

  if (heroTimer) {
    clearInterval(heroTimer);
    heroTimer = null;
  }

  renderHeroBook(heroBooks[0] || books[0]);

  if (heroBooks.length > 1) {
    heroTimer = setInterval(() => {
      heroIndex = (heroIndex + 1) % heroBooks.length;
      renderHeroBook(heroBooks[heroIndex]);
    }, 5000);
  }
}

function makeBookCard(book) {
  const img = coverUrl(book);
  return `
    <div class="card" onclick="openModalById('${book.id}')">
      <div class="cover">
        ${img ? `<img src="${img}" alt="${escapeHtml(book.title)}" loading="lazy"/>` : `<div class="no-cover">Sem capa</div>`}
      </div>
      <div class="card-info">
        <p class="card-title">${escapeHtml(book.title)}</p>
        <p class="card-author">${escapeHtml(book.author)}</p>
      </div>
    </div>
  `;
}

function buildSections(books) {
  const sorted = [...books].sort((a, b) => sortAlpha(a.title, b.title));
  const recent = [...books].slice(0, 24);
  const buckets = {
    "A–E": [],
    "F–J": [],
    "K–O": [],
    "P–T": [],
    "U–Z": [],
    "Outros títulos": [],
  };

  for (const book of sorted) {
    buckets[firstLetterBucket(book.title)].push(book);
  }

  const sections = [];
  if (recent.length) sections.push({ title: "Adicionados recentemente", items: recent });

  for (const title of ["A–E", "F–J", "K–O", "P–T", "U–Z", "Outros títulos"]) {
    if (buckets[title].length) sections.push({ title, items: buckets[title].slice(0, 80) });
  }

  return sections;
}

function renderRows(books) {
  rowsEl.innerHTML = "";
  const sections = buildSections(books);

  if (!sections.length) {
    rowsEl.innerHTML = `<section class="row"><div class="empty-state">Nada encontrado.</div></section>`;
    return;
  }

  rowsEl.innerHTML = sections.map((section) => `
    <section class="row">
      <div class="row-title">${section.title}</div>
      <div class="rail">
        ${section.items.map(makeBookCard).join("")}
      </div>
    </section>
  `).join("");
}

function renderAll(books) {
  currentBooks = books;
  ensureTopButtons();
  startHeroRotation(books);
  renderRows(books);
}

function openModal(book) {
  const modal = document.getElementById("modal");
  const modalTop = document.getElementById("modalTop");
  const img = coverUrl(book);

  modalTop.innerHTML = `
    <div class="modal-body">
      <div class="modal-cover">
        ${img ? `<img src="${img}" alt="${escapeHtml(book.title)}"/>` : `<div class="cover inline-cover"><div class="no-cover">Sem capa</div></div>`}
      </div>
      <div class="modal-content">
        <h2 class="modal-title">${escapeHtml(book.title)}</h2>
        <div class="modal-meta">
          <span class="pill">${escapeHtml(book.author)}</span>
          <span class="pill">${escapeHtml(book.category)}</span>
          <span class="pill">${escapeHtml(book.file_type.toUpperCase())}</span>
        </div>
        <p class="modal-desc">${escapeHtml(book.description || "Sem descrição.")}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" onclick="openBook('${book.file_url}')">Ler livro</button>
          <button class="btn" onclick="downloadBook('${book.file_url}','${escapeHtml(book.title)}')">Baixar</button>
          <button class="btn" onclick="closeModal()">Fechar</button>
        </div>
      </div>
    </div>
  `;

  modal.classList.add("show");
  modal.classList.remove("hidden");
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.classList.remove("show");
  modal.classList.add("hidden");
}

function openModalById(id) {
  const book = currentBooks.find((item) => item.id === id);
  if (book) openModal(book);
}

function openBook(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function downloadBook(url, title = "livro") {
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.download = title;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function filterBooks(query) {
  const q = normalizeText(query);
  if (!q) return currentBooks;
  return currentBooks.filter((book) => {
    const haystack = normalizeText(`${book.title} ${book.author} ${book.category} ${book.description}`);
    return haystack.includes(q);
  });
}

async function init() {
  try {
    ensureTopButtons();
    const books = await fetchBooks();
    currentBooks = books;
    renderAll(books);
  } catch (e) {
    heroTitle.textContent = "Bookflix";
    heroMeta.textContent = "Configuração pendente";
    heroDesc.textContent = e.message;
    rowsEl.innerHTML = `<section class="row"><div class="empty-state">${escapeHtml(e.message)}</div></section>`;
    console.error(e);
  }
}

searchInput?.addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const filtered = filterBooks(q);
    renderRows(filtered);
    renderHeroBook(filtered[0] || currentBooks[0]);
  }, 200);
});

document.getElementById("modal")?.addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});

init();
window.closeModal = closeModal;
window.logout = logout;
window.goUpload = goUpload;
window.goBulk = goBulk;
window.goLogin = goLogin;
window.goAdmin = goAdmin;
window.openModalById = openModalById;
window.openBook = openBook;
window.downloadBook = downloadBook;
