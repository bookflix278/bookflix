// backend/src/utils/coverLookup.js
export async function fetchCoverFromOpenLibrary({ title, author, isbn }) {
  const q = isbn
    ? `isbn:${encodeURIComponent(isbn)}`
    : `${encodeURIComponent(title || "")} ${encodeURIComponent(author || "")}`.trim();

  if (!q || q.length < 3) return null;

  const searchUrl = `https://openlibrary.org/search.json?q=${q}&limit=1`;

  const r = await fetch(searchUrl, {
    headers: { "User-Agent": "bookflix/1.0 (+local)" },
  });
  if (!r.ok) return null;

  const data = await r.json();
  const doc = data?.docs?.[0];

  // tenta cover_i (melhor caso)
  const coverId = doc?.cover_i;
  if (!coverId) return null;

  const imgUrl = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;

  const imgRes = await fetch(imgUrl);
  if (!imgRes.ok) return null;

  const arr = await imgRes.arrayBuffer();
  return { buffer: Buffer.from(arr), ext: "jpg", mime: "image/jpeg" };
}