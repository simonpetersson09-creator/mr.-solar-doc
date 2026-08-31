export interface ParsedConsumption {
  monthly: number[] | null;
  annual: number | null;
}

const MONTH_PATTERNS: RegExp[] = [
  /\b(jan(uari|uary)?)\b/i,
  /\b(feb(ruari|ruary)?)\b/i,
  /\b(mar(s|ch)?)\b/i,
  /\b(apr(il)?)\b/i,
  /\b(maj|may)\b/i,
  /\b(jun(i|e)?)\b/i,
  /\b(jul(i|y)?)\b/i,
  /\b(aug(usti|ust)?)\b/i,
  /\b(sep(t)?(ember)?)\b/i,
  /\b(okt(ober)?|oct(ober)?)\b/i,
  /\b(nov(ember)?)\b/i,
  /\b(dec(ember)?)\b/i,
];

const ANNUAL_PATTERNS: RegExp[] = [
  /(årsförbrukning|arsforbrukning|årsförbruk|total förbrukning|totalt|summa|annual consumption|total consumption|per år|per ar|yearly)/i,
];

/** Parses "1 234,5", "1.234,5", "1,234.5" or "336.45" into a number. */
export function parseLocaleNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00a0\u202f']/g, "");
  if (!/\d/.test(cleaned)) return null;
  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals === 3 ? cleaned.replace(/,/g, "") : cleaned.replace(",", ".");
  } else if (lastDot >= 0) {
    const decimals = cleaned.length - lastDot - 1;
    normalized = decimals === 3 ? cleaned.replace(/\./g, "") : cleaned;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Matches "2025-01", "2025/01", "01/2025" or "01.2025" near the line start. */
const NUMERIC_MONTH_PATTERNS: RegExp[] = [
  /^\D{0,3}(19|20)\d{2}\s*[-/.]\s*(0?[1-9]|1[0-2])\b/,
  /^\D{0,3}(0?[1-9]|1[0-2])\s*[-/.]\s*(19|20)\d{2}\b/,
];

/**
 * Detects the month a line refers to and returns the line with any leading
 * date token removed, so "2025-01" is not mistaken for a value.
 */
function monthForLine(line: string): { index: number; rest: string } {
  const yearFirst = NUMERIC_MONTH_PATTERNS[0]!.exec(line);
  if (yearFirst) {
    return { index: Number(yearFirst[2]) - 1, rest: line.slice(yearFirst[0].length) };
  }
  const monthFirst = NUMERIC_MONTH_PATTERNS[1]!.exec(line);
  if (monthFirst) {
    return { index: Number(monthFirst[1]) - 1, rest: line.slice(monthFirst[0].length) };
  }
  const byName = MONTH_PATTERNS.findIndex((pattern) => pattern.test(line));
  return { index: byName, rest: line };
}

// Grouped digits ("1 234,5", "1.234,5") or a plain number — never merging two
// separate numbers such as "2025 336,45" into one.
const NUMBER_SOURCE =
  "(?<![\\d.,])\\d{1,3}(?:[\\s\\u00a0\\u202f.,']\\d{3})+(?:[.,]\\d{1,2})?(?![\\d])" +
  "|(?<![\\d.,])\\d+(?:[.,]\\d+)?(?![\\d])";

/**
 * Picks the number that is attached to an energy unit (kWh/MWh/Wh) on the line.
 * MWh is converted to kWh. Returns null when no unit-bound number exists.
 */
function energyValueInLine(line: string): number | null {
  const pattern = new RegExp(`(${NUMBER_SOURCE})\\s*(kwh|mwh|wh|kw h)\\b`, "gi");
  let match: RegExpExecArray | null;
  let best: number | null = null;
  while ((match = pattern.exec(line)) !== null) {
    const value = parseLocaleNumber(match[1] ?? "");
    if (value === null) continue;
    const unit = (match[2] ?? "").toLowerCase();
    const scaled = unit === "mwh" ? value * 1000 : unit === "wh" ? value / 1000 : value;
    if (best === null) best = scaled;
  }
  return best;
}

function numbersInLine(line: string): number[] {
  const matches = line.match(new RegExp(NUMBER_SOURCE, "g")) ?? [];
  return matches
    .map((match) => parseLocaleNumber(match))
    .filter((value): value is number => value !== null);
}

/**
 * Scans free text lines from an invoice / spreadsheet export and extracts
 * monthly and/or annual electricity consumption in kWh.
 */
export function parseConsumptionText(text: string): ParsedConsumption {
  const lines = text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const monthly: (number | null)[] = Array.from({ length: 12 }, () => null);
  let annual: number | null = null;

  for (const line of lines) {
    const { index: monthIndex, rest } = monthForLine(line);
    const values = numbersInLine(rest);
    if (values.length === 0) continue;
    const energy = energyValueInLine(rest);

    if (annual === null && ANNUAL_PATTERNS.some((pattern) => pattern.test(line))) {
      const candidate = energy ?? values[values.length - 1];
      if (candidate !== undefined && candidate >= 100 && candidate <= 200000) {
        annual = candidate;
        continue;
      }
    }

    if (monthIndex === -1) continue;
    if (monthly[monthIndex] !== null) continue;

    // Prefer a number bound to a kWh unit; otherwise ignore a leading year
    // like "2025" in "Jan 2025 336,45".
    const candidates = values.filter((value) => !(Number.isInteger(value) && value >= 1900 && value <= 2100));
    const picked = energy ?? (candidates.length > 0 ? candidates[candidates.length - 1] : undefined);
    if (picked !== undefined && picked >= 0) {
      monthly[monthIndex] = picked;
    }
  }

  const filled = monthly.filter((value) => value !== null).length;
  const monthlyResult =
    filled >= 10 ? monthly.map((value) => Math.round((value ?? 0) * 100) / 100) : null;

  if (annual === null && monthlyResult) {
    annual = Math.round(monthlyResult.reduce((sum, value) => sum + value, 0));
  }

  return { monthly: monthlyResult, annual };
}
