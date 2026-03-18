export function notFound(_req, res) {
  return res.status(404).json({ error: "Rota não encontrada." });
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Erro interno do servidor.";

  if (status >= 500) {
    console.error("❌", err);
  }

  return res.status(status).json({ error: message });
}
