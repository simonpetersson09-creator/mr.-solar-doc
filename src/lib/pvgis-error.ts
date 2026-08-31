/**
 * PVGIS error transport.
 *
 * PVGIS often returns a useful `message` (e.g. "Location over the sea") that
 * helps the user fix the problem. The server function encodes that message
 * into the thrown Error so the UI can show human guidance — never a stack
 * trace or an internal code.
 */

export const PVGIS_ERROR_PREFIX = "PVGIS_ERROR";

export type PvgisErrorKind = "over-sea" | "outside-coverage" | "unknown";

export interface PvgisErrorInfo {
  kind: PvgisErrorKind;
  /** Cleaned upstream message, or null when PVGIS gave nothing usable. */
  message: string | null;
}

/** Encode status + upstream message into a single serialisable Error message. */
export function encodePvgisError(status: number, message?: string | null): string {
  const clean = cleanMessage(message);
  return `${PVGIS_ERROR_PREFIX}|${status}|${clean ?? ""}`;
}

/** Extract a `message` field from a PVGIS error body (JSON or plain text). */
export function extractPvgisMessage(body: string): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    const candidate =
      typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed.error === "string"
          ? parsed.error
          : null;
    return cleanMessage(candidate);
  } catch {
    // Plain-text bodies are only useful when short and not HTML.
    if (body.trimStart().startsWith("<")) return null;
    return cleanMessage(body);
  }
}

function cleanMessage(message?: string | null): string | null {
  if (!message) return null;
  const trimmed = message.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

function classify(message: string | null): PvgisErrorKind {
  if (!message) return "unknown";
  const lower = message.toLowerCase();
  if (lower.includes("sea") || lower.includes("ocean") || lower.includes("water")) {
    return "over-sea";
  }
  if (
    lower.includes("outside") ||
    lower.includes("out of") ||
    lower.includes("not covered") ||
    lower.includes("no data")
  ) {
    return "outside-coverage";
  }
  return "unknown";
}

/** Decode whatever the query layer caught into UI-safe information. */
export function describePvgisError(error: unknown): PvgisErrorInfo {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!raw.startsWith(PVGIS_ERROR_PREFIX)) {
    return { kind: "unknown", message: null };
  }
  const [, , ...rest] = raw.split("|");
  const message = cleanMessage(rest.join("|"));
  return { kind: classify(message), message };
}
