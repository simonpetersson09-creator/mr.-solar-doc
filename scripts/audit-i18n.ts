/* Read-only i18n parity audit. */
import fs from "node:fs";
import path from "node:path";

const dir = "src/i18n/locales";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));

function flatten(obj: unknown, prefix = "", out: Record<string, string> = {}) {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
      else out[key] = Array.isArray(v) ? v.join("|") : String(v);
    }
  }
  return out;
}

const maps: Record<string, Record<string, string>> = {};
for (const f of files) {
  const mod = await import(path.resolve(dir, f));
  const val = mod.default ?? Object.values(mod)[0];
  maps[f.replace(".ts", "")] = flatten(val);
}

const ref = maps["sv"]!;
const refKeys = Object.keys(ref);
console.log("reference sv keys:", refKeys.length);

let missingTotal = 0;
let extraTotal = 0;
let emptyTotal = 0;
for (const [loc, m] of Object.entries(maps)) {
  const missing = refKeys.filter((k) => !(k in m));
  const extra = Object.keys(m).filter((k) => !(k in ref));
  const empty = Object.entries(m).filter(([, v]) => v.trim() === "");
  missingTotal += missing.length;
  extraTotal += extra.length;
  emptyTotal += empty.length;
  if (missing.length || extra.length || empty.length) {
    console.log(
      `${loc}: missing=${missing.length} extra=${extra.length} empty=${empty.length}`,
      missing.slice(0, 6),
      extra.slice(0, 6),
      empty.slice(0, 6).map(([k]) => k),
    );
  }
}
console.log({ missingTotal, extraTotal, emptyTotal });

// Placeholder parity: {{x}} tokens must match the reference per key.
let placeholderIssues = 0;
for (const [loc, m] of Object.entries(maps)) {
  if (loc === "sv") continue;
  for (const k of refKeys) {
    const a = (ref[k]!.match(/\{\{[^}]+\}\}/g) ?? []).sort().join(",");
    const b = ((m[k] ?? "").match(/\{\{[^}]+\}\}/g) ?? []).sort().join(",");
    if (k in m && a !== b) {
      placeholderIssues++;
      if (placeholderIssues < 25) console.log(`placeholder ${loc} ${k}: sv[${a}] vs [${b}]`);
    }
  }
}
console.log({ placeholderIssues });

// Untranslated-vs-Swedish spot check is unreliable; instead flag keys whose
// value is byte-identical to Swedish in every non-Nordic locale.
const suspicious = refKeys.filter((k) => {
  const same = Object.entries(maps).filter(
    ([loc, m]) => !["sv", "no", "da"].includes(loc) && m[k] === ref[k],
  );
  return same.length >= 20 && !/^\s*$/.test(ref[k]!) && /[a-zA-ZåäöÅÄÖ]{4,}/.test(ref[k]!);
});
console.log("keys identical to Swedish in >=20 locales:", suspicious.length);
console.log(suspicious.slice(0, 30));
