import pdf from "pdf-poppler";
import path from "path";

export async function generateCover(pdfPath, outputDir) {

  const opts = {
    format: "jpeg",
    out_dir: outputDir,
    out_prefix: "cover",
    page: 1
  };

  try {

    await pdf.convert(pdfPath, opts);

    return path.join(outputDir, "cover-1.jpg");

  } catch (err) {

    console.error("Erro gerando capa:", err);
    return null;

  }

}