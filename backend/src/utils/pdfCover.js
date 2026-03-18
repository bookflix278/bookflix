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

function safeBaseName(s = "") {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "livro";
}

function colorSeed(title = "", author = "") {
  const seed = `${title}|${author}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

function buildSvg({ title, author, category }) {
  const t = esc(title || "Sem título");
  const a = esc(author || "Autor desconhecido");
  const c = esc(category || "Livro");
  const hue = colorSeed(title, author);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue}, 74%, 22%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 36) % 360}, 82%, 12%)"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(255,255,255,0.12)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="20" stdDeviation="18" flood-color="#000" flood-opacity="0.38"/>
    </filter>
  </defs>

  <rect width="600" height="900" rx="34" fill="url(#bg)"/>
  <rect x="32" y="34" width="536" height="832" rx="26" fill="rgba(0,0,0,0.22)" filter="url(#shadow)"/>
  <rect x="32" y="34" width="536" height="180" rx="26" fill="url(#shine)"/>

  <text x="68" y="118" fill="rgba(255,255,255,0.78)" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700">${c}</text>

  <foreignObject x="64" y="174" width="470" height="470">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,Helvetica,sans-serif;color:#fff;">
      <div style="font-size:48px;font-weight:900;line-height:1.08;letter-spacing:-0.5px;">${t}</div>
      <div style="margin-top:26px;font-size:24px;opacity:0.92;">${a}</div>
    </div>
  </foreignObject>

  <text x="66" y="814" fill="rgba(255,255,255,0.62)" font-family="Arial, Helvetica, sans-serif" font-size="18">Capa gerada automaticamente</text>
  <text x="66" y="846" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800">Bookflix</text>
</svg>`;
}

export async function generateCover({ title, author, category, coversDir }) {
  await fs.mkdir(coversDir, { recursive: true });

  const base = safeBaseName(`${title || "livro"}-${author || "autor"}`);
  const filename = `${base}-${crypto.randomBytes(6).toString("hex")}.svg`;
  const outPath = path.join(coversDir, filename);
  const svg = buildSvg({ title, author, category });

  await fs.writeFile(outPath, svg, "utf8");

  return {
    filename,
    mime: "image/svg+xml",
    size: Buffer.byteLength(svg, "utf8"),
    path: outPath,
  };
}

export async function ensurePdfCoverForFile({ pdfPath, coversDir, title, author, category }) {
  const parsed = path.parse(pdfPath);
  return generateCover({
    title: title || parsed.name,
    author,
    category,
    coversDir,
  });
}
