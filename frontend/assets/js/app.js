const API = window.BOOKFLIX_CONFIG?.BACKEND_URL || "https://bookflix-1-52pt.onrender.com";

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
let currentTopBooks = [];
let currentRecommendedBooks = [];

let serverFavorites = [];
let currentUser = null;

function token() {
  return localStorage.getItem("token") || "";
}

function getUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function coverUrl(book) {
  return book?.coverUrl || book?.cover_url || book?.cover?.url || (book?.cover?.filename ? `${API}/covers/${book.cover.filename}` : "");
}

function goUpload() { window.location.href = "upload.html"; }
function goBulk() { window.location.href = "bulk.html"; }
function goAdmin() { window.location.href = "admin.html"; }
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "login.html";
}
function goLogin() { window.location.href = "login.html"; }

function normalizeSortText(v) {
  return String(v || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sortAlpha(a, b) {
  return normalizeSortText(a).localeCompare(normalizeSortText(b), "pt-BR", { sensitivity: "base" });
}

function firstLetterBucket(title = "") {
  const t = normalizeSortText(title);
  const ch = (t[0] || "#").toUpperCase();
  if ("ABCDE".includes(ch)) return "A–E";
  if ("FGHIJ".includes(ch)) return "F–J";
  if ("KLMNO".includes(ch)) return "K–O";
  if ("PQRST".includes(ch)) return "P–T";
  if ("UVWXYZ".includes(ch)) return "U–Z";
  return "Outros títulos";
}

function isFavorite(bookId) {
  return serverFavorites.some((b) => (b._id || b.id) === bookId);
}

async function safeFetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}

async function fetchMe() {
  const t = token();
  if (!t) return null;
  try {
    const data = await safeFetchJSON(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
    return data.user || null;
  } catch { return null; }
}

async function fetchFavorites() {
  const t = token();
  if (!t) return [];
  try {
    const data = await safeFetchJSON(`${API}/api/user/favorites`, { headers: { Authorization: `Bearer ${t}` } });
    return data.favorites || [];
  } catch { return []; }
}

async function toggleFavorite(bookId) {
  const t = token();
  if (!t) return goLogin();
  try {
    const data = await safeFetchJSON(`${API}/api/user/favorite/${bookId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}` },
    });
    serverFavorites = data.favorites || [];
    renderAll(currentBooks, currentTopBooks, currentRecommendedBooks);
  } catch (err) {
    alert(err.message || "Não foi possível atualizar favoritos.");
  }
}

async function fetchBooks(search = "") {
  const url = new URL(`${API}/api/books`);
  if (search) url.searchParams.set("search", search);
  const data = await safeFetchJSON(url);
  return Array.isArray(data) ? data : data.books || [];
}

async function fetchTopBooks() {
  try {
    const data = await safeFetchJSON(`${API}/api/books/top`);
    return Array.isArray(data) ? data : data.books || [];
  } catch { return []; }
}

async function fetchRecommended() {
  try {
    const data = await safeFetchJSON(`${API}/api/books/recommended`);
    return Array.isArray(data) ? data : data.books || [];
  } catch { return []; }
}

function getHeroCandidates(books) {
  return [...books].filter((b) => b?.title).sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 8);
}

function ensureTopButtons() {
  const user = currentUser || getUser();
  const buttons = topActions?.querySelectorAll("button") || [];
  buttons.forEach((btn) => {
    if (btn.textContent === "Sair") btn.style.display = user ? "inline-flex" : "none";
    if (btn.textContent === "Entrar") btn.style.display = user ? "none" : "inline-flex";
    if (btn.textContent === "Admin") btn.style.display = user?.role === "admin" ? "inline-flex" : "none";
  });
}

function renderHeroBook(book) {
  if (!book) {
    heroTitle.textContent = "Bookflix";
    heroMeta.textContent = "Biblioteca digital pública";
    heroDesc.textContent = "Nenhum livro cadastrado ainda. Faça um upload para começar.";
    heroActions.innerHTML = `<button class="btn btn-primary" onclick="goUpload()">Enviar primeiro livro</button>`;
    heroBg.style.backgroundImage = "";
    return;
  }

  const img = coverUrl(book);
  const fav = isFavorite(book._id || book.id);
  const hello = currentUser?.name ? `Olá, ${currentUser.name}` : "Biblioteca digital";
  const adminBtn = currentUser?.role === "admin" ? `<button class="btn" onclick="location.href='admin.html'">Painel admin</button>` : "";

  heroBg.style.backgroundImage = img ? `url('${img}')` : "";
  heroTitle.textContent = book.title || "Sem título";
  heroMeta.textContent = `${hello} • ${book.author || "Autor"} • ${book.category || "Geral"} • ${book.downloads ?? 0} downloads`;
  heroDesc.textContent = (book.description || "Importado para sua biblioteca digital.").slice(0, 240);

  heroActions.innerHTML = `
    <button class="btn btn-primary" onclick="openModalById('${book._id || book.id}')">Ver detalhes</button>
    <button class="btn" onclick="tryDownload('${book._id || book.id}')">Download</button>
    <button class="btn" onclick="toggleFavorite('${book._id || book.id}')">${fav ? "❤ Favorito" : "♡ Favoritar"}</button>
    ${adminBtn}
  `;
}

function startHeroRotation(books) {
  heroBooks = getHeroCandidates(books);
  heroIndex = 0;
  if (heroTimer) clearInterval(heroTimer);
  heroTimer = null;
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
  const fav = isFavorite(book._id || book.id);

  return `
    <div class="card" onclick="openModalById('${book._id || book.id}')">
      <div class="cover">
        ${img ? `<img src="${img}" alt="${escapeHtml(book.title || "capa")}" loading="lazy"/>` : `<div class="no-cover">Sem capa</div>`}
        <button class="fav-chip ${fav ? "active" : ""}" onclick="event.stopPropagation(); toggleFavorite('${book._id || book.id}')">${fav ? "❤" : "♡"}</button>
      </div>
      <div class="card-info">
        <p class="card-title">${escapeHtml(book.title || "Sem título")}</p>
        <p class="card-author">${escapeHtml(book.author || "Desconhecido")}</p>
      </div>
    </div>
  `;
}

function buildSections(books, topBooks, recommendedBooks) {
  const sorted = [...books].sort((a, b) => sortAlpha(a.title, b.title));
  const recent = [...books].sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0)).slice(0, 24);
  const withoutCover = sorted.filter((b) => !coverUrl(b)).slice(0, 24);
  const buckets = { "A–E": [], "F–J": [], "K–O": [], "P–T": [], "U–Z": [], "Outros títulos": [] };
  for (const book of sorted) buckets[firstLetterBucket(book.title)].push(book);
  const sections = [];
  if (serverFavorites.length) sections.push({ title: "Seus favoritos", items: serverFavorites.slice(0, 24) });
  if (recent.length) sections.push({ title: "Adicionados recentemente", items: recent });
  if (topBooks.length) sections.push({ title: "Mais baixados", items: topBooks });
  if (recommendedBooks.length) sections.push({ title: "Recomendados para você", items: recommendedBooks });
  for (const title of ["A–E", "F–J", "K–O", "P–T", "U–Z", "Outros títulos"]) {
    if (buckets[title].length) sections.push({ title, items: buckets[title] });
  }
  if (withoutCover.length) sections.push({ title: "Sem capa", items: withoutCover });
  return sections;
}

function renderRows(books, topBooks, recommendedBooks) {
  rowsEl.innerHTML = "";
  const sections = buildSections(books, topBooks, recommendedBooks);
  if (!sections.length) {
    rowsEl.innerHTML = `<div class="row-title">Nada encontrado</div>`;
    return;
  }
  rowsEl.innerHTML = sections.map((section) => `
    <section class="row">
      <div class="row-title">${section.title}</div>
      <div class="rail">${section.items.map(makeBookCard).join("")}</div>
    </section>
  `).join("");
}

function renderAll(books, topBooks = [], recommendedBooks = []) {
  currentBooks = books;
  currentTopBooks = topBooks;
  currentRecommendedBooks = recommendedBooks;
  ensureTopButtons();
  startHeroRotation(books);
  renderRows(books, topBooks, recommendedBooks);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openModal(book) {
  const modal = document.getElementById("modal");
  const modalTop = document.getElementById("modalTop");
  const img = coverUrl(book);
  const fav = isFavorite(book._id || book.id);
  const canDownload = !!token();
  const dlBtn = canDownload ? `<button class="btn btn-primary" onclick="tryDownload('${book._id || book.id}')">Download</button>` : `<button class="btn" onclick="goLogin()">Entrar para baixar</button>`;

  modalTop.innerHTML = `
    <div class="modal-body">
      <div class="modal-cover">
        ${img ? `<img src="${img}" alt="${escapeHtml(book.title || "capa")}"/>` : `<div class="cover" style="aspect-ratio:2/3"><div class="no-cover">Sem capa</div></div>`}
      </div>
      <div class="modal-content">
        <h2 class="modal-title">${escapeHtml(book.title || "Sem título")}</h2>
        <div class="modal-meta">
          <span class="pill">${escapeHtml(book.author || "Autor")}</span>
          <span class="pill">${escapeHtml(book.category || "Geral")}</span>
          <span class="pill">${book.downloads ?? 0} downloads</span>
        </div>
        <p class="modal-desc">${escapeHtml(book.description || "Sem descrição.")}</p>
        <div class="modal-actions">
          ${dlBtn}
          <button class="btn" onclick="toggleFavorite('${book._id || book.id}')">${fav ? "❤ Favorito" : "♡ Favoritar"}</button>
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

async function openModalById(id) {
  try {
    const data = await safeFetchJSON(`${API}/api/books/${id}`);
    const book = data.book || data;
    if (book) openModal(book);
  } catch (err) {
    alert(err.message || "Não foi possível abrir o livro.");
  }
}

async function tryDownload(id) {
  const t = token();
  if (!t) return goLogin();
  window.open(`${API}/api/books/${id}/download`, "_blank");
}

async function init() {
  try {
    currentUser = await fetchMe();
    if (!currentUser) currentUser = getUser();
    const [books, topBooks, recommendedBooks, favorites] = await Promise.all([
      fetchBooks(""),
      fetchTopBooks(),
      fetchRecommended(),
      fetchFavorites(),
    ]);
    serverFavorites = favorites;
    renderAll(books, topBooks, recommendedBooks);
  } catch (e) {
    heroDesc.textContent = "Erro ao carregar. Verifique se o backend está rodando e se o CORS foi liberado.";
    console.error(e);
  }
}

searchInput?.addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    try {
      const [books, topBooks, recommendedBooks] = await Promise.all([
        fetchBooks(q),
        fetchTopBooks(),
        fetchRecommended(),
      ]);
      renderAll(books, topBooks, recommendedBooks);
    } catch (e) {
      console.error(e);
    }
  }, 250);
});

document.getElementById("modal")?.addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});

init();

window.closeModal = closeModal;
window.logout = logout;
window.goUpload = goUpload;
window.goBulk = goBulk;
window.goAdmin = goAdmin;
window.goLogin = goLogin;
window.tryDownload = tryDownload;
window.openModalById = openModalById;
window.toggleFavorite = toggleFavorite;
