/**
 * Brand palette — the single source of truth for the Mr. Solar Doc identity.
 *
 * The CSS design tokens in `src/styles.css` carry the same values expressed in
 * oklch; this module exists because the PDF renderer (jsPDF) needs plain RGB.
 * Never hardcode a colour anywhere else: extend this file instead.
 */

export const BRAND_HEX = {
  yellow: "#FFDC38",
  /** Slightly deeper yellow reserved for primary CTAs. */
  yellowCta: "#F3CB0C",
  yellowHover: "#F5CD18",
  yellowPressed: "#EFC200",
  yellowLight: "#FFE879",
  /** Soft yellow for secondary information areas (cards, tints). */
  yellowSoft: "#FFF0AE",
  black: "#1D191A",
  blackSoft: "#2A2426",
  paper: "#FCFBF7",
  /** #1D191A softened toward paper — never a separate grey hue. */
  muted: "#6E6A6B",
  line: "#E4E2DD",
} as const;

export type BrandRgb = [number, number, number];

function toRgb(hex: string): BrandRgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Same palette as RGB triplets, for renderers that cannot parse hex. */
export const BRAND_RGB = {
  yellow: toRgb(BRAND_HEX.yellow),
  yellowCta: toRgb(BRAND_HEX.yellowCta),
  yellowHover: toRgb(BRAND_HEX.yellowHover),
  yellowPressed: toRgb(BRAND_HEX.yellowPressed),
  yellowLight: toRgb(BRAND_HEX.yellowLight),
  yellowSoft: toRgb(BRAND_HEX.yellowSoft),
  black: toRgb(BRAND_HEX.black),
  blackSoft: toRgb(BRAND_HEX.blackSoft),
  paper: toRgb(BRAND_HEX.paper),
  muted: toRgb(BRAND_HEX.muted),
  line: toRgb(BRAND_HEX.line),
} satisfies Record<keyof typeof BRAND_HEX, BrandRgb>;
