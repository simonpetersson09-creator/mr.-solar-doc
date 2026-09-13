import { parseConsumptionText } from "../src/lib/parse-consumption-document";
const csv = ["Manad;kWh","Jan 2025;2100","Feb 2025;1900","Mar 2025;1700","Apr 2025;1400","Maj 2025;1200","Jun 2025;1000","Jul 2025;950","Aug 2025;1000","Sep 2025;1250","Okt 2025;1550","Nov 2025;1850","Dec 2025;2100"].join("\n");
console.log(JSON.stringify(parseConsumptionText(csv), null, 1));
const csv2 = csv.replace(/;/g, " ") ;
console.log("mellanslag:", JSON.stringify(parseConsumptionText(csv2).monthly));
const csv3 = ["Januari 2025;2100","Februari 2025;1900","Mars 2025;1700","April 2025;1400","Maj 2025;1200","Juni 2025;1000","Juli 2025;950","Augusti 2025;1000","September 2025;1250","Oktober 2025;1550","November 2025;1850","December 2025;2100"].join("\n");
console.log("fullnamn:", JSON.stringify(parseConsumptionText(csv3).monthly));
