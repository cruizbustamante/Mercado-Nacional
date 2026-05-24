/**
 * Convierte un archivo (PDF, DOC, DOCX, MD, TXT) a texto plano para parsing.
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

  if (ext === "docx" || ext === "doc") {
    const mammoth = await import("mammoth");
    const buf = await file.arrayBuffer();
    // mammoth con extractRawText devuelve solo texto
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return result.value;
  }

  throw new Error(`Formato no soportado: .${ext}. Acepta PDF, DOC, DOCX, MD o TXT.`);
}
