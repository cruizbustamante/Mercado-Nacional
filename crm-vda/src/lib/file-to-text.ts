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
    // .doc puede ser:
    //  1) CFB clásico Word 97-2003 (binario)        → word-extractor
    //  2) OOXML zip (un .docx renombrado)           → mammoth
    //  3) HTML / RTF / XML "Word 2003 XML"          → texto plano
    const buf = Buffer.from(await file.arrayBuffer());
    const errors: string[] = [];

    // Detectar magic bytes
    const sig = buf.slice(0, 8);
    const isPK = sig[0] === 0x50 && sig[1] === 0x4b;          // PK = zip (OOXML)
    const isCFB =                                              // D0 CF 11 E0 A1 B1 1A E1 (CFB)
      sig[0] === 0xd0 && sig[1] === 0xcf && sig[2] === 0x11 && sig[3] === 0xe0;

    // 1) OOXML disfrazado → mammoth
    if (isPK) {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: buf });
        return result.value;
      } catch (e) { errors.push(`mammoth: ${(e as Error).message}`); }
    }

    // 2) CFB binario → word-extractor
    if (isCFB) {
      try {
        const WordExtractor = (await import("word-extractor")).default;
        const extractor = new WordExtractor();
        const doc = await extractor.extract(buf);
        const body = doc.getBody();
        if (body && body.trim().length > 0) return body;
        errors.push("word-extractor: cuerpo vacío");
      } catch (e) { errors.push(`word-extractor: ${(e as Error).message}`); }
    }

    // 3) HTML / RTF / XML / texto plano → leer como UTF-8 y limpiar
    try {
      const text = buf.toString("utf8");
      // Si es HTML, strip tags básico
      if (/<html|<body|<table|<\?xml/i.test(text)) {
        return text
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\s+/g, " ")
          .trim();
      }
      // Si es RTF (comienza con {\rtf), strip códigos básicos
      if (text.startsWith("{\\rtf")) {
        return text
          .replace(/\\[a-z]+\d*\s?/gi, " ")
          .replace(/[{}]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      // Sin sentido → falla
      throw new Error("Formato no reconocido");
    } catch (e) {
      errors.push(`texto: ${(e as Error).message}`);
    }

    throw new Error(`No se pudo leer el .doc. Intentos: ${errors.join(" | ")}`);
  }

  throw new Error(`Formato no soportado: .${ext}. Acepta PDF, DOC, DOCX, MD o TXT.`);
}
