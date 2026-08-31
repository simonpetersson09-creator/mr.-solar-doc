import { parseConsumptionText, type ParsedConsumption } from "@/lib/parse-consumption-document";

async function loadPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const data = new Uint8Array(await file.arrayBuffer());
  return pdfjs.getDocument({ data }).promise;
}

async function readPdfText(file: File, langs: string[]): Promise<string> {
  const doc = await loadPdf(file);
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const transform = item.transform as number[];
      const y = Math.round((transform[5] ?? 0) / 3);
      const x = transform[4] ?? 0;
      const row = rows.get(y) ?? [];
      row.push({ x, text: item.str });
      rows.set(y, row);
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) =>
        row
          .sort((a, b) => a.x - b.x)
          .map((cell) => cell.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    pages.push(lines.join("\n"));
  }

  const text = pages.join("\n");
  // Scanned / image-only PDFs have no text layer — fall back to OCR.
  if (text.replace(/\s/g, "").length >= 40) return text;
  return readPdfViaOcr(doc, langs);
}

type PdfDocument = Awaited<ReturnType<typeof loadPdf>>;

/** Rasterises up to the first 4 pages and OCRs them. */
async function readPdfViaOcr(doc: PdfDocument, langs: string[]): Promise<string> {
  if (typeof document === "undefined") return "";
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(langs);
  const pages: string[] = [];
  try {
    const pageCount = Math.min(doc.numPages, 4);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) continue;
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const { data } = await worker.recognize(canvas);
      pages.push(data.text);
      canvas.width = 0;
      canvas.height = 0;
    }
  } catch {
    return pages.join("\n");
  } finally {
    await worker.terminate();
  }
  return pages.join("\n");
}


async function readSpreadsheetText(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheets: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, blankrows: false });
    sheets.push(rows.map((row) => row.map((cell) => (cell ?? "").toString()).join("\t")).join("\n"));
  }
  return sheets.join("\n");
}

async function readImageText(file: File): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["swe", "eng"]);
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|tiff?|heic)$/;

export async function readConsumptionFile(file: File): Promise<ParsedConsumption> {
  const name = file.name.toLowerCase();
  let text: string;

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    text = await readPdfText(file);
  } else if (/\.(xlsx|xls|ods)$/.test(name)) {
    text = await readSpreadsheetText(file);
  } else if (file.type.startsWith("image/") || IMAGE_EXTENSIONS.test(name)) {
    text = await readImageText(file);
  } else {
    text = await file.text();
  }

  return parseConsumptionText(text);
}
