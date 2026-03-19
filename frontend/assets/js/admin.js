const ADMIN_API = window.BOOKFLIX_CONFIG?.BACKEND_URL || "https://bookflix-1-52pt.onrender.com";

function token() {
  return localStorage.getItem("token") || "";
}

function authHeaders() {
  return {
    Authorization: "Bearer " + token(),
    "Content-Type": "application/json"
  };
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  location.href = "login.html";
}

async function getJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erro na requisição");
  return data;
}

async function loadStats() {
  const data = await getJSON(ADMIN_API + "/api/admin/stats", { headers: authHeaders() });
  document.getElementById("statsGrid").innerHTML = `
    <div class="stat"><div class="k">Usuários</div><div class="v">${data.users}</div></div>
    <div class="stat"><div class="k">Livros</div><div class="v">${data.books}</div></div>
    <div class="stat"><div class="k">Livros ativos</div><div class="v">${data.activeBooks}</div></div>
    <div class="stat"><div class="k">Downloads</div><div class="v">${data.totalDownloads}</div></div>
  `;
}

async function loadBooks() {
  const data = await getJSON(ADMIN_API + "/api/admin/books", { headers: authHeaders() });
  document.getElementById("booksTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Título</th>
          <th>Autor</th>
          <th>Categoria</th>
          <th>Downloads</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${data.books.map(book => `
          <tr>
            <td>${escapeHtml(book.title || "")}</td>
            <td>${escapeHtml(book.author || "")}</td>
            <td>${escapeHtml(book.category || "")}</td>
            <td>${book.downloads || 0}</td>
            <td>
              <div class="actions">
                <button class="mini danger" onclick="deleteBook('${book._id}')">Apagar</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function loadUsers() {
  const data = await getJSON(ADMIN_API + "/api/admin/users", { headers: authHeaders() });
  document.getElementById("usersTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${data.users.map(user => `
          <tr>
            <td>${escapeHtml(user.name || "")}</td>
            <td>${escapeHtml(user.email || "")}</td>
            <td>${escapeHtml(user.role || "user")}</td>
            <td>${user.isBanned ? "Banido" : "Ativo"}</td>
            <td>
              <div class="actions">
                <button class="mini warn" onclick="toggleBan('${user._id}')">${user.isBanned ? "Desbanir" : "Banir"}</button>
                <button class="mini ok" onclick="toggleRole('${user._id}')">${user.role === "admin" ? "Virar user" : "Virar admin"}</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function deleteBook(id) {
  if (!confirm("Apagar este livro?")) return;
  await getJSON(ADMIN_API + "/api/admin/books/" + id, {
    method: "DELETE",
    headers: authHeaders()
  });
  await refreshAll();
}

async function toggleBan(id) {
  await getJSON(ADMIN_API + "/api/admin/users/" + id + "/ban", {
    method: "PATCH",
    headers: authHeaders()
  });
  await refreshAll();
}

async function toggleRole(id) {
  await getJSON(ADMIN_API + "/api/admin/users/" + id + "/role", {
    method: "PATCH",
    headers: authHeaders()
  });
  await refreshAll();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function refreshAll() {
  await Promise.all([loadStats(), loadBooks(), loadUsers()]);
}

refreshAll().catch(err => {
  alert(err.message);
  if (/unauthorized|forbidden|token/i.test(err.message)) {
    location.href = "login.html";
  }
});

window.logout = logout;
window.deleteBook = deleteBook;
window.toggleBan = toggleBan;
window.toggleRole = toggleRole;
