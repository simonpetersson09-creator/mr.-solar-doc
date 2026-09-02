/* Read-only: every t("key") used in src must exist in every locale. */
import fs from "node:fs";
import path from "node:path";

function walk(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !p.includes("i18n/locales")) out.push(p);
  }
  return out;
}

function flatten(obj: unknown, prefix = "", out: Record<string, unknown> = {}) {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      out[key] = v;
      if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    }
  }
  return out;
}

const locales: Record<string, Record<string, unknown>> = {};
for (const f of fs.readdirSync("src/i18n/locales").filter((f) => f.endsWith(".ts"))) {
  const mod = await import(path.resolve("src/i18n/locales", f));
  locales[f.replace(".ts", "")] = flatten(mod.default ?? Object.values(mod)[0]);
}

const used = new Set<string>();
for (const file of walk("src")) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g)) used.add(m[1]!);
  for (const m of src.matchAll(/i18n(?:Instance)?\.t\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g))
    used.add(m[1]!);
}
console.log("static t() keys used:", used.size);
const missing: string[] = [];
for (const k of used) {
  const absent = Object.entries(locales).filter(([, m]) => !(k in m));
  if (absent.length) missing.push(`${k} -> missing in ${absent.map(([l]) => l).join(",")}`);
}
console.log("keys missing somewhere:", missing.length);
console.log(missing.slice(0, 40).join("\n"));

const svKeys = Object.keys(locales["sv"]!).filter(
  (k) => typeof locales["sv"]![k] !== "object" || Array.isArray(locales["sv"]![k]),
);
const unused = svKeys.filter((k) => ![...used].some((u) => u === k || k.startsWith(`${u}.`)));
console.log("leaf keys never referenced statically:", unused.length);
console.log(unused.slice(0, 60).join(", "));
