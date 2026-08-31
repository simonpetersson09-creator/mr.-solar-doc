/**
 * Central unit formatting. Components must not build their own unit strings.
 *
 * The calculation engine always works in SI base units (W, Wh, A, V, Hz and a
 * 0..1 share). Everything here belongs to the presentation layer only.
 */

import {
  formatCurrency,
  formatCurrencyPrecise,
  formatDecimal,
  formatNumber,
  formatPercent,
} from "./format";

export type UnitSystem = "metric" | "imperial";

export interface UnitFormatContext {
  locale: string;
  /** ISO 4217 code, decided by country — never by language. */
  currency: string;
  /** Prepared for future imperial support; metric is the only one implemented. */
  system?: UnitSystem;
}

export type EnergyUnit = "Wh" | "kWh" | "MWh";
export type PowerUnit = "W" | "kW" | "kWp";
export type ElectricalUnit = "A" | "V" | "Hz";

function withUnit(value: string, unit: string): string {
  // Narrow no-break space keeps the number and unit together on small screens.
  return `${value}\u202f${unit}`;
}

export function formatPower(
  value: number,
  ctx: UnitFormatContext,
  unit: PowerUnit = "kW",
  digits = unit === "W" ? 0 : 1,
): string {
  return withUnit(formatDecimal(value, ctx.locale, digits), unit);
}

export function formatEnergy(
  value: number,
  ctx: UnitFormatContext,
  unit: EnergyUnit = "kWh",
  digits = 0,
): string {
  return withUnit(
    digits > 0 ? formatDecimal(value, ctx.locale, digits) : formatNumber(value, ctx.locale),
    unit,
  );
}

export function formatElectrical(
  value: number,
  ctx: UnitFormatContext,
  unit: ElectricalUnit,
): string {
  return withUnit(formatNumber(value, ctx.locale), unit);
}

/** Share is a 0..1 fraction internally, shown as a locale-aware percentage. */
export function formatShare(share: number, ctx: UnitFormatContext, digits = 0): string {
  return formatPercent(share, ctx.locale, digits);
}

export function formatMoney(value: number, ctx: UnitFormatContext): string {
  return formatCurrency(value, ctx.locale, ctx.currency);
}

export function formatMoneyPrecise(
  value: number,
  ctx: UnitFormatContext,
  digits = 2,
): string {
  return formatCurrencyPrecise(value, ctx.locale, ctx.currency, digits);
}

/** e.g. "1,50 SEK/kWh" — currency comes from the country, digits from locale. */
export function formatPricePerKwh(value: number, ctx: UnitFormatContext, digits = 2): string {
  return `${formatCurrencyPrecise(value, ctx.locale, ctx.currency, digits)}/kWh`;
}

/** e.g. "15 000 SEK/kWp". */
export function formatPricePerKwp(value: number, ctx: UnitFormatContext): string {
  return `${formatCurrency(value, ctx.locale, ctx.currency)}/kWp`;
}

/** Converts Wh to the most readable energy unit without losing precision. */
export function autoEnergy(valueKwh: number, ctx: UnitFormatContext): string {
  const abs = Math.abs(valueKwh);
  if (abs >= 1000) return formatEnergy(valueKwh / 1000, ctx, "MWh", 1);
  if (abs < 1) return formatEnergy(valueKwh * 1000, ctx, "Wh");
  return formatEnergy(valueKwh, ctx, "kWh");
}
