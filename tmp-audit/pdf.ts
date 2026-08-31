import { generateReportBlob } from "@/services/solar-report-service";
import { runCalculation } from "@/lib/calc/engine";
import { getMarketConfig } from "@/config/markets";
import { resolveEconomicsDefaults, getCountryConfig } from "@/config/countries";
import { sv } from "@/i18n/locales/sv";

const t = (path: string) => path.split(".").reduce((o: any, k) => o?.[k], sv as any);
function calc(country: string, self: number | null, exp: number | null) {
  const econ = resolveEconomicsDefaults(country, { selfConsumedValuePerKwh: self, exportValuePerKwh: exp });
  return runCalculation({
    location: { latitude: -1.29, longitude: 36.82, address: "Nairobi", countryCode: country } as any,
    resource: { annualKwhPerKwp: 1459, monthlyKwhPerKwp: Array.from({length:12},()=>121.6), source: "pvgis", tiltDegrees: 1, azimuthDegrees: 0 } as any,
    consumption: { annualKwh: 8000, monthlyKwh: null, inputType: "annual", shape: "standard", isEstimated: false } as any,
    electrical: { mainFuseAmp: 40, maxAcPowerKw: 9.6, connection: { type: "amperage", amperageA: 40, serviceType: "single-phase", voltageV: 240 }, serviceType: "single-phase", gridVoltageV: 240, gridPhases: 1, gridFrequencyHz: 50, pvPowerLimitKw: 9.6, pvLimitBinding: "connection-capacity", pvRulesStatus: "generic", gridProfileStatus: "unsupported", gridProfileConfirmed: true } as any,
    economics: { selfConsumedValuePerKwh: econ.selfConsumedValuePerKwh, exportValuePerKwh: econ.exportValuePerKwh, installationCostPerKwp: econ.installationCostPerKwp ?? null, gridCompensationPerKwh: econ.gridCompensationPerKwh, gridCompensationEnabled: getCountryConfig(country).economics.gridCompensation.enabled, currency: econ.currencyCode, valuesMissing: econ.valuesMissing, selfConsumedValueSource: self === null ? "standard-value" : "user-override", exportValueSource: exp === null ? "standard-value" : "user-override" } as any,
    selfConsumptionShare: 0.35, acceptedPaybackYears: 12, annualPriceChangeRate: 0.02, quotePrice: null,
    inverterSizesKw: getMarketConfig(country).inverterSizesKw,
  } as any).result;
}
const labels: any = {
  title: t("report.title"), appName: t("app.name"), summary: t("report.summary"), technical: t("report.technical"),
  economicSummary: t("report.economicSummary"), sizing: t("report.sizing"), production: t("report.production"),
  consumption: t("report.consumption"), economics: t("report.economics"), assumptions: t("report.assumptions"),
  disclaimer: t("report.disclaimer"), generated: t("report.generated"),
  months: ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"],
  rationale: "x", coverageNote: "x", paybackNote: "x", quoteNote: "x", consumptionSource: "x", consumptionShape: null,
  chartProduction: t("report.chartProduction"), chartConsumption: t("report.chartConsumption"),
  origin: t("report.origin"), fields: t("report.fields"),
  economicsRequiresPrice: t("result.economicsRequiresPrice"), economicsRequiresPriceShort: t("result.economicsRequiresPriceShort"),
  gridUnverifiedTitle: t("result.gridUnverifiedTitle"), gridUnverifiedWarning: t("result.gridUnverifiedWarning"),
  faqTitle: t("report.faqTitle"), faqItems: t("report.faqItems"),
};
for (const [name, self, exp] of [["missing", null, null], ["filled", 0.3, 0.1]] as const) {
  const blob = generateReportBlob({ result: calc("KE", self, exp), labels, locale: "sv-SE" } as any);
  await Bun.write(`/tmp/report-${name}.pdf`, await blob.arrayBuffer());
  console.log(name, "bytes", blob.size);
}
