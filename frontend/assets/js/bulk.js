const BULK_API = window.BOOKFLIX_CONFIG?.BACKEND_URL || "http://127.0.0.1:4000";
const bulkMsg = document.getElementById("msg");

function setBulkMsg(message, ok = false) {
  bulkMsg.textContent = message || "";
  bulkMsg.style.color = ok ? "#7df5a6" : "#c7cad1";
}

document.getElementById("send")?.addEventListener("click", async () => {
  try {
    const zipFile = document.getElementById("zip")?.files?.[0];
    if (!zipFile) throw new Error("Escolha um arquivo ZIP.");

    setBulkMsg("Enviando ZIP...");

    const form = new FormData();
    form.append("file", zipFile);

    const r = await fetch(BULK_API + "/api/books/upload-zip", {
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

    setBulkMsg("ZIP enviado com sucesso!", true);
  } catch (e) {
    setBulkMsg(e.message || "Erro no upload");
  }
});
