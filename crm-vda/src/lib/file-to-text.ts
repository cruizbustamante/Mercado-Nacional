/**
 * Convierte un archivo (PDF, DOC, DOCX, MD, TXT) a texto plano para parsing.
 *
 * .docx → mammoth (formato OOXML / zip)
 * .doc  → word-extractor (formato CFB / Word 97-2003 binario, no es zip)
 * .pdf  → pdf-parse
 * .md, .txt → lectura directa
 */

export async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() ?? "";

  if (ext === "md" || ext === "txt") {
    return await file.text();
  }

  if (ext === "pdf") {
    const buf = Buffer.from(await file.arrayBuffer());
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buf);
    return data.text;
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return result.value;
  }

  if (ext === "doc") {
    // .doc clásico (Word 97-2003, binario CFB) — no es zip, mammoth no lo lee
    const WordExtractor = (await import("word-extractor")).default;
    const extractor = new WordExtractor();
    const buf = Buffer.from(await file.arrayBuffer());
    const doc = await extractor.extract(buf);
    return doc.getBody();
  }

  throw new Error(`Formato no soportado: .${ext}. Acepta PDF, DOC, DOCX, MD o TXT.`);
}
