import path from "path";
import unzipper from "unzipper";
import { XMLParser } from "fast-xml-parser";

/**
 * Extrai metadata básica do EPUB:
 * - title
 * - author
 * - description (quando existir)
 * - coverBuffer + coverExt (jpg/png/webp quando detectável)
 */
export async function extractEpubMeta(epubFilePath) {
  const directory = await unzipper.Open.file(epubFilePath);

  const containerFile = directory.files.find((f) => f.path === "META-INF/container.xml");
  if (!containerFile) return null;

  const parser = new XMLParser({ ignoreAttributes: false });
  const containerXml = (await containerFile.buffer()).toString("utf8");
  const containerData = parser.parse(containerXml);

  const opfPath =
    containerData?.container?.rootfiles?.rootfile?.["@_full-path"] ||
    containerData?.container?.rootfiles?.rootfile?.[0]?.["@_full-path"];

  if (!opfPath) return null;

  const opfFile = directory.files.find((f) => f.path === opfPath);
  if (!opfFile) return null;

  const opfXml = (await opfFile.buffer()).toString("utf8");
  const opfData = parser.parse(opfXml);

  const pkg = opfData?.package;
  if (!pkg) return null;

  const md = pkg.metadata || {};
  const manifest = pkg.manifest?.item || [];

  // helpers
  const pickText = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && typeof v["#text"] === "string") return v["#text"];
    return null;
  };

  // title/author/description (bem tolerante)
  const title = pickText(md["dc:title"]) || pickText(md["title"]);
  const author = pickText(md["dc:creator"]) || pickText(md["creator"]);
  const description = pickText(md["dc:description"]) || pickText(md["description"]);

  const items = Array.isArray(manifest) ? manifest : [manifest];

  // 1) padrão moderno: properties="cover-image"
  let coverHref = items.find((it) => it?.["@_properties"] === "cover-image")?.["@_href"] || null;

  // 2) padrão antigo: meta name="cover" content="id"
  if (!coverHref) {
    const meta = md["meta"];
    const metas = Array.isArray(meta) ? meta : meta ? [meta] : [];
    const coverId =
      metas.find((m) => m?.["@_name"] === "cover")?.["@_content"] ||
      metas.find((m) => m?.["@_property"] === "cover")?.["#text"] ||
      null;

    if (coverId) {
      coverHref = items.find((it) => it?.["@_id"] === coverId)?.["@_href"] || null;
    }
  }

  let coverBuffer = null;
  let coverExt = null;

  if (coverHref) {
    const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(opfPath), coverHref));
    const coverFile = directory.files.find((f) => f.path === normalized);

    if (coverFile) {
      coverBuffer = await coverFile.buffer();
      coverExt = path.extname(coverHref).toLowerCase().replace(".", "") || null;

      // se não deu pra pegar ext, tenta pelo header
      if (!coverExt && coverBuffer?.length >= 12) {
        const sig = coverBuffer.slice(0, 12).toString("hex");
        if (sig.startsWith("ffd8ff")) coverExt = "jpg";
        else if (sig.startsWith("89504e47")) coverExt = "png";
        else if (coverBuffer.slice(0, 4).toString("ascii") === "RIFF") coverExt = "webp";
      }
    }
  }

  return {
    title: title?.toString()?.trim() || null,
    author: author?.toString()?.trim() || null,
    description: description?.toString()?.trim() || null,
    coverBuffer,
    coverExt,
  };
}