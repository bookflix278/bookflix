const CONFIG = window.BOOKFLIX_CONFIG || {};
const API = CONFIG.BACKEND_URL || "https://bookflix-1-52pt.onrender.com";

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
let allBooks = [];

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
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

function prettifyTitle(raw = "", fileUrl = "") {
  let title = String(raw || "").trim();
  if ((!title || /^[a-f0-9]{24,}$/i.test(title)) && fileUrl) {
    try {
      title = decodeURIComponent(fileUrl.split("?")[0].split("/").pop() || "");
    } catch {}
  }
  title = title
    .replace(/\.(pdf|epub|mobi|azw3)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return "Livro";
  if (/^[a-f0-9]{24,}$/i.test(title)) return `Livro ${title.slice(0, 6)}`;
  return title;
}

function fallbackCover(title = "Livro") {
  return `https://dummyimage.com/300x450/1e1e2f/e50914.png&text=${encodeURIComponent(title.slice(0, 20))}`;
}

function normalizeBook(book) {
  const fileUrl = book.fileUrl || book.file_url || book.downloadUrl || "";
  const title = prettifyTitle(book.title, fileUrl);
  const cover = book.coverUrl || book.cover_url || (book.cover?.filename ? `${API}/covers/${book.cover.filename}` : "") || fallbackCover(title);

  return {
    id: String(book.id || book._id || ""),
    title,
    author: book.author || "Desconhecido",
    category: book.category || "Geral",
    description: book.description || "Livro disponível na biblioteca.",
    cover_url: cover,
    file_url: fileUrl,
    file_type: book.file_type || book.fileType || (fileUrl.toLowerCase().includes(".epub") ? "epub" : "pdf"),
    downloads: book.downloads || 0,
    created_at: book.created_at || book.createdAt || null,
  };
}

function goUpload() { location.href = "upload.html"; }
function goBulk() { location.href = "bulk.html"; }
function goLogin() { location.href = "login.html"; }
function goAdmin() { location.href = "admin.html"; }
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  location.href = "login.html";
}

function ensureTopButtons() {
  const user = getUser();
  const buttons = topActions?.querySelectorAll("button") || [];
  buttons.forEach((btn) => {
    if (btn.textContent === "Sair") btn.style.display = user ? "inline-flex" : "none";
    if (btn.textContent === "Entrar") btn.style.display = user ? "none" : "inline-flex";
    if (btn.textContent === "Admin") btn.style.display = user?.role === "admin" ? "inline-flex" : "none";
  });
}

async function getJSON(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}

async function fetchBooks(search = "") {
  const url = new URL(`${API}/api/books`);
  if (search) url.searchParams.set("search", search);
  const data = await getJSON(url.toString());
  const books = Array.isArray(data) ? data : data.books || [];
  return books.map(normalizeBook);
}

async function fetchTopBooks() {
  try {
    const data = await getJSON(`${API}/api/books/top`);
    const books = Array.isArray(data) ? data : data.books || [];
    return books.map(normalizeBook);
  } catch {
    return [];
  }
}

async function fetchRecommended() {
  try {
    const data = await getJSON(`${API}/api/books/recommended`);
    const books = Array.isArray(data) ? data : data.books || [];
    return books.map(normalizeBook);
  } catch {
    return [];
  }
}

function getHeroCandidates(books) {
  return [...books].slice(0, 10);
}

function renderHeroBook(book) {
  const user = getUser();

  if (!book) {
    heroBg.style.backgroundImage = "";
    heroTitle.textContent = "Bookflix";
    heroMeta.textContent = "Biblioteca digital pública";
    heroDesc.textContent = "Nenhum livro cadastrado ainda. Faça um upload para começar.";
    heroActions.innerHTML = `<button class="btn btn-primary" onclick="goUpload()">Enviar primeiro livro</button>`;
    return;
  }

  heroBg.style.backgroundImage = book.cover_url ? `url('${book.cover_url}')` : "";
  heroTitle.textContent = book.title;
  heroMeta.textContent = `${user?.name ? `Olá, ${user.name}` : "Biblioteca digital"} • ${book.author} • ${book.category}`;
  heroDesc.textContent = (book.description || "Sem descrição.").slice(0, 220);
  heroActions.innerHTML = `
    <button class="btn btn-primary" onclick="openModalById('${book.id}')">Ver detalhes</button>
    <button class="btn" onclick="openBook('${book.file_url}')">Ler livro</button>
    <button class="btn" onclick="downloadBook('${book.file_url}','${escapeHtml(book.title)}')">Baixar</button>
  `;
}

function startHeroRotation(books) {
  heroBooks = getHeroCandidates(books);
  heroIndex = 0;
  if (heroTimer) clearInterval(heroTimer);
  renderHeroBook(heroBooks[0] || books[0]);
  if (heroBooks.length > 1) {
    heroTimer = setInterval(() => {
      heroIndex = (heroIndex + 1) % heroBooks.length;
      renderHeroBook(heroBooks[heroIndex]);
    }, 5000);
  }
}

function makeBookCard(book) {
  return `
    <div class="card" onclick="openModalById('${book.id}')">
      <div class="cover">
        <img src="${book.cover_url}" alt="${escapeHtml(book.title)}" loading="lazy"/>
      </div>
      <div class="card-info">
        <p class="card-title">${escapeHtml(book.title)}</p>
        <p class="card-author">${escapeHtml(book.author)}</p>
      </div>
    </div>
  `;
}

function buildSections(books, topBooks, recommendedBooks) {
  const sections = [];
  const recent = [...books].sort((a,b)=> new Date(b.created_at || 0)-new Date(a.created_at ||0)).slice(0,24);
  const buckets = {"A–E":[],"F–J":[],"K–O":[],"P–T":[],"U–Z":[],"Outros títulos":[]};

  for (const book of [...books].sort((a,b)=>normalizeText(a.title).localeCompare(normalizeText(b.title),"pt-BR"))) {
    const ch = (normalizeText(book.title)[0] || "#").toUpperCase();
    if ("ABCDE".includes(ch)) buckets["A–E"].push(book);
    else if ("FGHIJ".includes(ch)) buckets["F–J"].push(book);
    else if ("KLMNO".includes(ch)) buckets["K–O"].push(book);
    else if ("PQRST".includes(ch)) buckets["P–T"].push(book);
    else if ("UVWXYZ".includes(ch)) buckets["U–Z"].push(book);
    else buckets["Outros títulos"].push(book);
  }

  if (recent.length) sections.push({ title: "Adicionados recentemente", items: recent });
  if (topBooks.length) sections.push({ title: "Mais baixados", items: topBooks.slice(0,24) });
  if (recommendedBooks.length) sections.push({ title: "Recomendados", items: recommendedBooks.slice(0,24) });
  for (const title of ["A–E","F–J","K–O","P–T","U–Z","Outros títulos"]) {
    if (buckets[title].length) sections.push({ title, items: buckets[title].slice(0,60) });
  }
  return sections;
}

function renderRows(books, topBooks = [], recommendedBooks = []) {
  rowsEl.innerHTML = "";
  const sections = buildSections(books, topBooks, recommendedBooks);
  if (!sections.length) {
    rowsEl.innerHTML = `<section class="row"><div class="empty-state">Nada encontrado.</div></section>`;
    return;
  }
  rowsEl.innerHTML = sections.map(section => `
    <section class="row">
      <div class="row-title">${section.title}</div>
      <div class="rail">${section.items.map(makeBookCard).join("")}</div>
    </section>
  `).join("");
}

function openModal(book) {
  const modal = document.getElementById("modal");
  const modalTop = document.getElementById("modalTop");
  modalTop.innerHTML = `
    <div class="modal-body">
      <div class="modal-cover">
        <img src="${book.cover_url}" alt="${escapeHtml(book.title)}"/>
      </div>
      <div class="modal-content">
        <h2 class="modal-title">${escapeHtml(book.title)}</h2>
        <div class="modal-meta">
          <span class="pill">${escapeHtml(book.author)}</span>
          <span class="pill">${escapeHtml(book.category)}</span>
          <span class="pill">${escapeHtml(String(book.file_type).toUpperCase())}</span>
        </div>
        <p class="modal-desc">${escapeHtml(book.description)}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" onclick="openBook('${book.file_url}')">Ler livro</button>
          <button class="btn" onclick="downloadBook('${book.file_url}','${escapeHtml(book.title)}')">Baixar</button>
          <button class="btn" onclick="closeModal()">Fechar</button>
        </div>
      </div>
    </div>`;
  modal.classList.add("show");
  modal.classList.remove("hidden");
}

function openModalById(id) {
  const book = allBooks.find((b) => b.id === id);
  if (book) openModal(book);
}

function closeModal() {
  document.getElementById("modal")?.classList.add("hidden");
  document.getElementById("modal")?.classList.remove("show");
}

function openBook(url) {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
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
  if (!q) return allBooks;
  return allBooks.filter((book) => normalizeText(`${book.title} ${book.author} ${book.category} ${book.description}`).includes(q));
}

async function init() {
  try {
    ensureTopButtons();
    const [books, topBooks, recommendedBooks] = await Promise.all([
      fetchBooks(""),
      fetchTopBooks(),
      fetchRecommended(),
    ]);
    allBooks = books;
    startHeroRotation(books);
    renderRows(books, topBooks, recommendedBooks);
  } catch (e) {
    heroTitle.textContent = "Bookflix";
    heroMeta.textContent = "Erro ao carregar";
    heroDesc.textContent = e.message || "Não foi possível carregar os livros.";
    rowsEl.innerHTML = `<section class="row"><div class="empty-state">${escapeHtml(e.message || "Erro")}</div></section>`;
    console.error(e);
  }
}

searchInput?.addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const filtered = filterBooks(e.target.value.trim());
    renderRows(filtered, [], []);
    renderHeroBook(filtered[0] || allBooks[0]);
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
