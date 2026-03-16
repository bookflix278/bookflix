const API = "http://localhost:4000";

function setMsg(message) {
  const el = document.getElementById("msg");
  if (el) el.textContent = message || "";
}

async function postJSON(path, data) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const text = await res.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(json?.error || `Erro ${res.status}: ${text}`);
  }

  return json;
}

async function handleLoginSubmit(e) {
  e.preventDefault();

  try {
    setMsg("Entrando...");

    const email = document.getElementById("email")?.value.trim();
    const password = document.getElementById("password")?.value;

    const out = await postJSON("/api/auth/login", { email, password });

    localStorage.setItem("token", out.token);
    localStorage.setItem("user", JSON.stringify(out.user));

    setMsg("✅ Login realizado com sucesso!");
    setTimeout(() => {
      window.location.href = "./index.html";
    }, 500);
  } catch (err) {
    setMsg("❌ " + err.message);
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();

  try {
    setMsg("Criando conta...");

    const name = document.getElementById("name")?.value.trim();
    const email = document.getElementById("email")?.value.trim();
    const password = document.getElementById("password")?.value;

    const out = await postJSON("/api/auth/register", { name, email, password });

    localStorage.setItem("token", out.token);
    localStorage.setItem("user", JSON.stringify(out.user));

    setMsg("✅ Conta criada com sucesso!");
    setTimeout(() => {
      window.location.href = "./index.html";
    }, 500);
  } catch (err) {
    setMsg("❌ " + err.message);
  }
}

function bootAuthPage() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  if (loginForm) {
    loginForm.addEventListener("submit", handleLoginSubmit);
  }

  if (registerForm) {
    registerForm.addEventListener("submit", handleRegisterSubmit);
  }
}

document.addEventListener("DOMContentLoaded", bootAuthPage);