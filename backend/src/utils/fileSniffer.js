import fs from "fs/promises";

export async function isRealPDF(filePath) {
  const fd = await fs.open(filePath, "r");
  const buf = Buffer.alloc(5);
  await fd.read(buf, 0, 5, 0);
  await fd.close();
  return buf.toString("utf8") === "%PDF-";
}

export async function isAllowedImage(filePath) {
  const fd = await fs.open(filePath, "r");
  const buf = Buffer.alloc(12);
  await fd.read(buf, 0, 12, 0);
  await fd.close();

  // PNG
  const png = buf
    .slice(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  // JPG
  const jpg = buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));

  // WEBP
  const webp =
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP";

  return png || jpg || webp;
}

// ✅ EPUB é um ZIP (assinatura PK..). MVP seguro o suficiente pra aceitar .epub real.
export async function isRealEPUB(filePath) {
  const fd = await fs.open(filePath, "r");
  const buf = Buffer.alloc(4);
  await fd.read(buf, 0, 4, 0);
  await fd.close();

  const isZip =
    (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) || // PK\x03\x04
    (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x05 && buf[3] === 0x06) || // PK\x05\x06
    (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x07 && buf[3] === 0x08);   // PK\x07\x08

  return isZip;
}