import { parseConsumptionText, type ParsedConsumption } from "@/lib/parse-consumption-document";

async function readPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
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
