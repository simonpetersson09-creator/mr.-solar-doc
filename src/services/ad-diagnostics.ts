export type AdDiagnostic = {
  stage: string;
  reason?: string;
  code?: number;
  at: number;
};
const entries: AdDiagnostic[] = [];

/** Local bounded diagnostics only: no identifiers, consent strings or receipts. */
export function recordAdDiagnostic(stage: string, reason?: string, code?: number): void {
  const entry = { stage, ...(reason ? { reason } : {}), ...(code === undefined ? {} : { code }), at: Date.now() };
  entries.push(entry);
  if (entries.length > 100) entries.shift();
  console.info("[admob]", entry);
}

export function getAdDiagnostics(): readonly AdDiagnostic[] {
  return entries.map((entry) => ({ ...entry }));
}