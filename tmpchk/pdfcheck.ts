import { writeFileSync } from "node:fs";
import { pdfText, reportNeedsUnicodeFont, reportLanguage } from "@/services/solar-report-service";
import { jsPDF } from "jspdf";
import { NOTO_SANS_REGULAR_BASE64, NOTO_SANS_BOLD_BASE64 } from "@/assets/fonts/noto-sans-unicode";
const samples: Record<string,string[]> = {
  el: ["Ηλιακή έκθεση – Στοκχόλμη","Ετήσια παραγωγή: 12 101 kWh · 1,44 €/kWh","Ιδιοκατανάλωση 64 % · Εξαγωγή 36 %","Πίνακας: Ισχύς 12,9 kWp | Μετατροπέας 12 kW"],
  uk: ["Сонячний звіт – Стокгольм","Річне виробництво: 12 101 кВт·год · 1,44 zł/кВт·год","Власне споживання 64 % · Експорт 36 %","Таблиця: Потужність 12,9 kWp | Інвертор 12 kW"],
  sv: ["Solrapport – Stockholm","Årsproduktion: 12 101 kWh · 1,44 kr/kWh","Egenanvändning 64 % · Export 36 %","Tabell: Effekt 12,9 kWp | Växelriktare 12 kW"],
};
for (const [lang, lines] of Object.entries(samples)) {
  const joined = lines.join(" ");
  const unicode = reportNeedsUnicodeFont(joined);
  const doc = new jsPDF({ unit:"mm", format:"a4" });
  if (unicode) {
    doc.addFileToVFS("N.ttf", NOTO_SANS_REGULAR_BASE64); doc.addFont("N.ttf","NotoSans","normal");
    doc.addFileToVFS("NB.ttf", NOTO_SANS_BOLD_BASE64); doc.addFont("NB.ttf","NotoSans","bold");
  }
  let y = 25;
  for (const [i, line] of lines.entries()) {
    doc.setFont(unicode?"NotoSans":"helvetica", i===0?"bold":"normal");
    doc.setFontSize(i===0?18:11);
    const wrapped = doc.splitTextToSize(pdfText(line, unicode), 170) as string[];
    doc.text(wrapped, 15, y); y += wrapped.length*7 + 3;
  }
  writeFileSync(`/tmp/pdf-${lang}.pdf`, Buffer.from(doc.output("arraybuffer")));
  console.log(lang, "unicodeFont:", unicode);
}
console.log("hi ->", reportLanguage("hi"), "| sv ->", reportLanguage("sv"), "| el ->", reportLanguage("el"), "| uk ->", reportLanguage("uk-UA"));
