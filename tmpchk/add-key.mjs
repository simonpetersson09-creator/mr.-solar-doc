import fs from "fs";
const T = {
 sv:"PDF-rapporten levereras på engelska.",
 en:"The PDF report is delivered in English.",
 fi:"PDF-raportti toimitetaan englanniksi.",
 da:"PDF-rapporten leveres på engelsk.",
 de:"Der PDF-Bericht wird auf Englisch erstellt.",
 cs:"PDF report je vytvořen v angličtině.",
 pl:"Raport PDF jest dostarczany w języku angielskim.",
 sk:"Správa vo formáte PDF je v angličtine.",
 sl:"Poročilo PDF je v angleščini.",
 et:"PDF-aruanne esitatakse inglise keeles.",
 lv:"PDF atskaite tiek sagatavota angļu valodā.",
 lt:"PDF ataskaita pateikiama anglų kalba.",
 fr:"Le rapport PDF est fourni en anglais.",
 it:"Il report PDF viene fornito in inglese.",
 es:"El informe PDF se entrega en inglés.",
 pt:"O relatório em PDF é fornecido em inglês.",
 nl:"Het PDF-rapport wordt in het Engels geleverd.",
 no:"PDF-rapporten leveres på engelsk.",
 ro:"Raportul PDF este furnizat în limba engleză.",
 el:"Η αναφορά PDF παρέχεται στα αγγλικά.",
 hu:"A PDF-jelentés angol nyelven készül.",
 hr:"PDF izvještaj dostavlja se na engleskom jeziku.",
 sr:"PDF izveštaj se dostavlja na engleskom jeziku.",
 bg:"PDF отчетът се предоставя на английски език.",
 uk:"PDF-звіт надається англійською мовою.",
 tr:"PDF raporu İngilizce olarak sunulur.",
 hi:"PDF रिपोर्ट अंग्रेज़ी में दी जाती है।",
 id:"Laporan PDF disediakan dalam bahasa Inggris.",
 he:"דוח ה-PDF מסופק באנגלית.",
};
for (const [lang, text] of Object.entries(T)) {
  const p = `src/i18n/locales/${lang}.ts`;
  let s = fs.readFileSync(p, "utf8");
  if (s.includes("reportInEnglish:")) { console.log("hoppar", lang); continue; }
  const m = s.match(/^(\s*)appleNote: [^\n]*\n/m);
  if (!m) { console.log("SAKNAS appleNote", lang); continue; }
  s = s.replace(m[0], `${m[0]}${m[1]}reportInEnglish: ${JSON.stringify(text)},\n`);
  fs.writeFileSync(p, s);
  console.log("ok", lang);
}
