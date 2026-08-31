import { buildPvgisRequest, buildPvgisOrientationFallbackRequest, isImplausibleOptimalTilt } from "@/lib/pvgis-params";
import { runCalculation } from "@/lib/calc/engine";
import { getMarketConfig } from "@/config/markets";
import { resolveEconomicsDefaults, getCountryConfig, getCurrencyCode } from "@/config/countries";
import { resolveConnectionConfig } from "@/config/connections";

const SITES = [
  ["NO", "Oslo", 59.91, 10.75, 63, "three-phase", 230],
  ["MX", "Guadalajara", 20.67, -103.35, 50, "split-phase", 240],
  ["CL", "Santiago", -33.45, -70.67, 25, "single-phase", 220],
  ["NZ", "Christchurch", -43.53, 172.64, 63, "single-phase", 230],
  ["TH", "Bangkok", 13.76, 100.5, 45, "single-phase", 230],
  ["KE", "Nairobi", -1.29, 36.82, 40, "single-phase", 240],
  ["TR", "Izmir", 38.42, 27.14, 32, "single-phase", 230],
  ["PL", "Krakow", 50.06, 19.94, 25, "three-phase", 400],
  ["ID", "Bandung", -6.91, 107.6, 30, "single-phase", 220],
  ["AR", "Cordoba", -31.42, -64.18, 40, "single-phase", 220],
] as const;

async function pvgis(lat: number, lon: number) {
  let plan = buildPvgisRequest({ latitude: lat, longitude: lon, tilt: null, azimuth: null });
  let res = await fetch(plan.url);
  let before: any = null;
  if (!res.ok && res.status >= 500 && plan.mode === "optimal-angles") {
    plan = buildPvgisOrientationFallbackRequest({ latitude: lat, longitude: lon, tilt: null, azimuth: null });
    res = await fetch(plan.url);
  }
  let json: any = await res.json();
  if (plan.mode === "optimal-angles") {
    const slope = json.inputs?.mounting_system?.fixed?.slope?.value ?? null;
    before = { slope, aspect: json.inputs?.mounting_system?.fixed?.azimuth?.value ?? null, yield: json.outputs?.totals?.fixed?.E_y };
    if (isImplausibleOptimalTilt(slope, lat)) {
      const fb = buildPvgisOrientationFallbackRequest({ latitude: lat, longitude: lon, tilt: null, azimuth: null });
      const fr = await fetch(fb.url);
      if (fr.ok) { const fj: any = await fr.json(); if (fj.outputs?.monthly?.fixed?.length === 12) { plan = fb; json = fj; } }
    }
  }
  const fixed = json.inputs?.mounting_system?.fixed;
  return { mode: plan.mode, before, slope: fixed?.slope?.value, aspect: fixed?.azimuth?.value,
    annual: json.outputs?.totals?.fixed?.E_y, monthly: json.outputs.monthly.fixed.map((m: any) => m.E_m) };
}

function calc(country: string, lat: number, lon: number, pv: any, amp: number, service: string, volt: number, self: number | null, exp: number | null) {
  const econ = resolveEconomicsDefaults(country, { selfConsumedValuePerKwh: self, exportValuePerKwh: exp });
  const market = getMarketConfig(country);
  const conn = resolveConnectionConfig(country);
  const phases = service === "three-phase" ? 3 : 1;
  const maxAc = service === "three-phase" ? Math.sqrt(3) * volt * amp / 1000 : volt * amp / 1000;
  return runCalculation({
    location: { latitude: lat, longitude: lon, address: "x", countryCode: country } as any,
    resource: { annualKwhPerKwp: pv.annual, monthlyKwhPerKwp: pv.monthly, source: "pvgis", tiltDegrees: pv.slope, azimuthDegrees: pv.aspect } as any,
    consumption: { annualKwh: 8000, monthlyKwh: null, inputType: "annual", shape: "standard", isEstimated: false } as any,
    electrical: { mainFuseAmp: amp, maxAcPowerKw: maxAc, connection: { type: "amperage", amperageA: amp, serviceType: service, voltageV: volt }, serviceType: service, gridVoltageV: volt, gridPhases: phases, gridFrequencyHz: 50, pvPowerLimitKw: maxAc, pvLimitBinding: "connection-capacity", pvRulesStatus: "generic", gridProfileStatus: conn.status, gridProfileConfirmed: true } as any,
    economics: { selfConsumedValuePerKwh: econ.selfConsumedValuePerKwh, exportValuePerKwh: econ.exportValuePerKwh, installationCostPerKwp: econ.installationCostPerKwp ?? null, gridCompensationPerKwh: econ.gridCompensationPerKwh, gridCompensationEnabled: getCountryConfig(country).economics.gridCompensation.enabled, currency: econ.currencyCode, valuesMissing: econ.valuesMissing, selfConsumedValueSource: self === null ? "standard-value" : "user-override", exportValueSource: exp === null ? "standard-value" : "user-override" } as any,
    selfConsumptionShare: 0.35, acceptedPaybackYears: 12, annualPriceChangeRate: 0.02, quotePrice: null,
    inverterSizesKw: market.inverterSizesKw,
  } as any);
}

const rows: any[] = [];
for (const [c, city, lat, lon, amp, service, volt] of SITES) {
  const pv = await pvgis(lat, lon);
  const a = calc(c, lat, lon, pv, amp, service as string, volt, null, null);
  const b = calc(c, lat, lon, pv, amp, service as string, volt, 0.3, 0.1);
  rows.push({ c, city, mode: pv.mode, before: pv.before, slope: pv.slope, aspect: pv.aspect,
    annual: Math.round(pv.annual), currency: getCurrencyCode(c), conn: resolveConnectionConfig(c).status,
    kwp: a.result.installedKwp, inv: a.result.inverterKw ?? a.result.presentation?.maxAcPowerKw,
    prod: Math.round(a.result.annualProductionKwh),
    econA: a.result.economicsStatus, totalA: a.result.presentation.annualSavings,
    econB: b.result.economicsStatus, totalB: Math.round(b.result.presentation.annualSavings),
    paybackB: b.result.investment.maxInvestmentRounded, status: a.status });
}
console.log(JSON.stringify(rows, null, 1));
