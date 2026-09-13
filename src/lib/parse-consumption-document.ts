import { MAX_PLAUSIBLE_ANNUAL_CONSUMPTION_KWH } from "@/lib/calc/validation";

export interface ParsedConsumption {
  /** 12 slots. `null` = the document said nothing about that month. */
  monthly: (number | null)[] | null;
  /** Sum of the known months only — a partial sum when months are missing. */
  monthlySum: number | null;
  monthsFilled: number;
  /** Annual figure stated in the document (summary/total row), never a guess. */
  annual: number | null;
  /** Years the document contains data for, ascending. */
  years: number[];
  /** The year the returned months come from. */
  year: number | null;
  /** Numbers were found but no field could be identified as consumption. */
  ambiguous: boolean;
  /** A complete monthly series disagrees with the stated annual figure. */
  annualConflict: boolean;
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

/** Rows that state a total — used for the annual figure, never summed as a month. */
const SUMMARY_PATTERNS: RegExp[] = [
  /(årsförbrukning|arsforbrukning|årsförbruk|total förbrukning|totalt|total|summa|sum\b|annual consumption|total consumption|per år|per ar|yearly|jahresverbrauch)/i,
];

/** Meter readings look like consumption but are cumulative counter values. */
const METER_PATTERN =
  /(mätarställning|matarstallning|mätarstånd|mätarst|ställning|avläsning|meter\s*reading|meterreading|meter\s*stand|z[äa]hlerst|reading|counter|index)/i;

/** Explicit consumption labels — preferred over any other number on the row. */
const CONSUMPTION_PATTERN =
  /(förbrukning|förbrukad|förbruk|forbruk|energiförbrukning|kulutus|consumption|consumed|usage|used|verbrauch|consumo|consommation|zu[żz]ycie|energi\b|energy\b)/i;

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
 * Detects the month (and year, when stated) a line refers to and returns the
 * line with any leading date token removed, so "2025-01" is never read as a
 * value.
 */
function periodForLine(line: string): { index: number; year: number | null; rest: string } {
  const yearFirst = NUMERIC_MONTH_PATTERNS[0]!.exec(line);
  if (yearFirst) {
    return {
      index: Number(yearFirst[2]) - 1,
      year: Number(`${yearFirst[1]}${yearFirst[0].match(/(19|20)(\d{2})/)?.[2] ?? ""}`) || null,
      rest: line.slice(yearFirst[0].length),
    };
  }
  const monthFirst = NUMERIC_MONTH_PATTERNS[1]!.exec(line);
  if (monthFirst) {
    return {
      index: Number(monthFirst[1]) - 1,
      year: Number(monthFirst[0].match(/(?:19|20)\d{2}/)?.[0] ?? "") || null,
      rest: line.slice(monthFirst[0].length),
    };
  }
  const byName = MONTH_PATTERNS.findIndex((pattern) => pattern.test(line));
  const namedYear = byName === -1 ? null : Number(line.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? "") || null;
  return { index: byName, year: namedYear, rest: line };
}

// Grouped digits ("1 234,5", "1.234,5") or a plain number — never merging two
// separate numbers such as "2025 336,45" into one.
const NUMBER_SOURCE =
  "(?<![\\d.,])\\d{1,3}(?:[\\s\\u00a0\\u202f.,']\\d{3})+(?:[.,]\\d{1,2})?(?![\\d])" +
  "|(?<![\\d.,])\\d+(?:[.,]\\d+)?(?![\\d])";

interface NumberToken {
  value: number;
  unitScale: number | null;
  labelledConsumption: boolean;
  labelledMeter: boolean;
  looksLikeYear: boolean;
  looksLikeClock: boolean;
}

function tokensInLine(line: string): NumberToken[] {
  const pattern = new RegExp(NUMBER_SOURCE, "g");
  const tokens: NumberToken[] = [];
  let match: RegExpExecArray | null;
  let previousEnd = 0;
  while ((match = pattern.exec(line)) !== null) {
    const raw = match[0];
    const value = parseLocaleNumber(raw);
    const before = line.slice(previousEnd, match.index);
    const after = line.slice(match.index + raw.length, match.index + raw.length + 8);
    previousEnd = match.index + raw.length;
    if (value === null) continue;
    const unit = /^\s*(kwh|mwh|wh|kw h)\b/i.exec(after)?.[1]?.toLowerCase();
    tokens.push({
      value,
      unitScale: unit ? (unit === "mwh" ? 1000 : unit === "wh" ? 1 / 1000 : 1) : null,
      labelledConsumption: CONSUMPTION_PATTERN.test(before) && !METER_PATTERN.test(before),
      labelledMeter: METER_PATTERN.test(before),
      looksLikeYear: Number.isInteger(value) && value >= 1900 && value <= 2100,
      looksLikeClock: /[:.]\s*$/.test(before) || /^\s*[:]/.test(after),
    });
  }
  return tokens;
}

function scaled(token: NumberToken): number {
  return token.value * (token.unitScale ?? 1);
}

/**
 * Picks the number on the row that actually is consumption. A labelled
 * consumption field wins; meter readings are excluded; if nothing can be
 * distinguished the row is reported as ambiguous instead of guessed.
 */
function consumptionValueInLine(line: string): { value: number | null; ambiguous: boolean } {
  const tokens = tokensInLine(line);
  if (tokens.length === 0) return { value: null, ambiguous: false };

  const labelled = tokens.find((token) => token.labelledConsumption);
  if (labelled) return { value: scaled(labelled), ambiguous: false };

  const usable = tokens.filter(
    (token) => !token.labelledMeter && !token.looksLikeYear && !token.looksLikeClock,
  );
  const withUnit = usable.filter((token) => token.unitScale !== null);
  if (withUnit.length > 0) return { value: scaled(withUnit[0]!), ambiguous: false };
  if (usable.length === 0) {
    // Only meter readings / dates on this row — refuse to guess.
    return { value: null, ambiguous: tokens.some((token) => token.labelledMeter) };
  }
  return { value: usable[usable.length - 1]!.value, ambiguous: false };
}

const DELIMITER = /\t|;|\|/;

/** Finds the consumption column of a delimited export from its header row. */
function consumptionColumn(line: string): number | null {
  if (!DELIMITER.test(line)) return null;
  const cells = line.split(DELIMITER).map((cell) => cell.trim());
  const index = cells.findIndex(
    (cell) => CONSUMPTION_PATTERN.test(cell) && !METER_PATTERN.test(cell),
  );
  if (index === -1) return null;
  // A header row has no consumption value of its own.
  const looksLikeHeader = cells.every((cell) => !/^\s*[\d.,\s]+$/.test(cell) || cell === "");
  return looksLikeHeader ? index : null;
}

function isPlausibleAnnual(value: number): boolean {
  return value >= 100 && value <= MAX_PLAUSIBLE_ANNUAL_CONSUMPTION_KWH;
}

interface YearBucket {
  monthly: (number | null)[];
  annual: number | null;
}

function emptyBucket(): YearBucket {
  return { monthly: Array.from({ length: 12 }, () => null), annual: null };
}

/**
 * Scans free text lines from an invoice / spreadsheet export and extracts
 * monthly and/or annual electricity consumption in kWh.
 *
 * Rows belonging to the same period are summed (two hourly rows of 1 and
 * 2 kWh give 3 kWh), summary rows are kept apart so they are never added on
 * top of the rows they summarise, and each calendar year is kept separate.
 */
export function parseConsumptionText(
  text: string,
  options: { year?: number | null } = {},
): ParsedConsumption {
  const lines = text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const buckets = new Map<number | "unknown", YearBucket>();
  let ambiguous = false;
  let column: number | null = null;

  const bucketFor = (year: number | null) => {
    const key = year ?? "unknown";
    const existing = buckets.get(key);
    if (existing) return existing;
    const created = emptyBucket();
    buckets.set(key, created);
    return created;
  };

  for (const line of lines) {
    const header = consumptionColumn(line);
    if (header !== null) {
      column = header;
      continue;
    }

    const { index: monthIndex, year, rest } = periodForLine(line);
    let value: number | null = null;
    let rowAmbiguous = false;

    if (column !== null && DELIMITER.test(line)) {
      const cell = line.split(DELIMITER)[column]?.trim() ?? "";
      value = parseLocaleNumber(cell);
      if (value === null && cell !== "") rowAmbiguous = true;
    }
    if (value === null && !rowAmbiguous) {
      const picked = consumptionValueInLine(rest);
      value = picked.value;
      rowAmbiguous = picked.ambiguous;
    }
    if (rowAmbiguous) ambiguous = true;
    if (value === null || value < 0) continue;

    const bucket = bucketFor(year);
    if (SUMMARY_PATTERNS.some((pattern) => pattern.test(line))) {
      if (bucket.annual === null && isPlausibleAnnual(value)) bucket.annual = value;
      continue;
    }
    if (monthIndex === -1) continue;
    bucket.monthly[monthIndex] = (bucket.monthly[monthIndex] ?? 0) + value;
  }

  const filledIn = (bucket: YearBucket) => bucket.monthly.filter((v) => v !== null).length;
  const datedYears = [...buckets.keys()].filter((key): key is number => key !== "unknown");
  const yearsWithData = datedYears.filter((year) => filledIn(buckets.get(year)!) > 0).sort((a, b) => a - b);

  let key: number | "unknown";
  if (options.year != null && buckets.has(options.year)) {
    key = options.year;
  } else if (yearsWithData.length > 0) {
    // Most complete year wins; the latest year breaks a tie.
    key = yearsWithData.reduce((best, year) =>
      filledIn(buckets.get(year)!) > filledIn(buckets.get(best)!) ? year : year > best && filledIn(buckets.get(year)!) === filledIn(buckets.get(best)!) ? year : best,
    );
  } else if (buckets.has("unknown")) {
    key = "unknown";
  } else {
    key = datedYears[0] ?? "unknown";
  }

  const bucket = buckets.get(key) ?? emptyBucket();
  const monthsFilled = filledIn(bucket);
  const monthly = monthsFilled > 0 ? bucket.monthly.map((v) => (v === null ? null : Math.round(v * 100) / 100)) : null;
  const monthlySum =
    monthly === null
      ? null
      : Math.round(monthly.reduce((sum, value) => sum + (value ?? 0), 0) * 100) / 100;

  const annualCandidates = [bucket.annual, buckets.get("unknown")?.annual ?? null];
  const annual = annualCandidates.find((value) => value !== null && isPlausibleAnnual(value)) ?? null;

  const annualConflict =
    monthsFilled === 12 &&
    annual !== null &&
    monthlySum !== null &&
    Math.abs(annual - monthlySum) > Math.max(12, monthlySum * 0.01);

  return {
    monthly,
    monthlySum,
    monthsFilled,
    annual,
    years: yearsWithData,
    year: typeof key === "number" ? key : null,
    ambiguous: ambiguous && monthsFilled === 0 && annual === null,
    annualConflict,
  };
}
