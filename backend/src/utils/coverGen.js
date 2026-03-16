import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Gera uma capa simples e bonita em SVG (zero dependências).
 * Retorna { filename, mime, size }
 */
export async function generateCoverSVG({ title, author, category }) {
  const coversDir = path.resolve("uploads/covers");
  await fs.mkdir(coversDir, { recursive: true });

  const filename = `${crypto.randomBytes(16).toString("hex")}.svg`;
  const outPath = path.join(coversDir, filename);

  const t = esc(title || "Sem título");
  const a = esc(author || "Autor desconhecido");
  const c = esc(category || "Geral");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0b0f"/>
      <stop offset="1" stop-color="#1b1b28"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e50914"/>
      <stop offset="1" stop-color="#b00710"/>
    </linearGradient>
  </defs>
  <rect width="600" height="900" fill="url(#bg)"/>
  <rect x="0" y="0" width="600" height="10" fill="url(#accent)"/>
  <rect x="0" y="890" width="600" height="10" fill="url(#accent)"/>

  <text x="40" y="110" font-family="Arial, sans-serif" font-size="26" fill="#b7b7c9">${c}</text>

  <foreignObject x="40" y="170" width="520" height="470">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; color: #fff;">
      <div style="font-size: 48px; font-weight: 800; line-height: 1.1; letter-spacing: -0.5px;">${t}</div>
      <div style="margin-top: 22px; font-size: 24px; color:#d0d0dd;">${a}</div>
    </div>
  </foreignObject>

  <text x="40" y="820" font-family="Arial, sans-serif" font-size="22" fill="#e50914">Bookflix</text>
</svg>`;

  await fs.writeFile(outPath, svg, "utf8");
  const stat = await fs.stat(outPath);
  return { filename, mime: "image/svg+xml", size: stat.size };
}
