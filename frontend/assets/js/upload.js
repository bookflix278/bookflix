const UPLOAD_API = window.BOOKFLIX_CONFIG?.BACKEND_URL || "https://bookflix-1-52pt.onrender.com";
const uploadMsg = document.getElementById("msg");

function setUploadMsg(message, ok = false) {
  uploadMsg.textContent = message || "";
  uploadMsg.style.color = ok ? "#7df5a6" : "#c7cad1";
}

document.getElementById("uploadBtn")?.addEventListener("click", async () => {
  try {
    setUploadMsg("Enviando...");

    const bookFile = document.getElementById("file")?.files?.[0];
    const coverFile = document.getElementById("cover")?.files?.[0];

    if (!bookFile) throw new Error("Escolha um arquivo de livro.");

    const form = new FormData();
    form.append("title", document.getElementById("title")?.value || "");
    form.append("author", document.getElementById("author")?.value || "");
    form.append("category", document.getElementById("category")?.value || "");
    form.append("description", document.getElementById("description")?.value || "");
    form.append("file", bookFile);
    if (coverFile) form.append("cover", coverFile);

    const r = await fetch(UPLOAD_API + "/api/books/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + (localStorage.getItem("token") || ""),
      },
      body: form,
    });

    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }

    if (!r.ok) throw new Error(data?.error || text || "Erro no upload");

    setUploadMsg("Livro enviado com sucesso!", true);
  } catch (e) {
    setUploadMsg(e.message || "Erro no upload");
  }
});
