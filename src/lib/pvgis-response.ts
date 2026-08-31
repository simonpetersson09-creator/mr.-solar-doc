/** Pure parsing of the PVGIS PVcalc response. */

export interface PvgisJson {
  outputs?: {
    monthly?: { fixed?: Array<{ month: number; E_m: number }> };
    totals?: { fixed?: { E_y: number } };
  };
  inputs?: {
    mounting_system?: { fixed?: { slope?: { value?: number } } };
    meteo_data?: { radiation_db?: string };
  };
  /** Legacy location of meteo_data in older PVGIS versions. */
  meta?: { inputs?: { meteo_data?: { radiation_db?: string } } };
}

/**
 * Radiation database label, e.g. "PVGIS-SARAH3" / "PVGIS-ERA5".
 * v5.3 exposes it under `inputs.meteo_data`; the old `meta.inputs` path is
 * kept as a defensive fallback, then a generic version label.
 */
export function readDataSource(json: PvgisJson): string {
  const db =
    json.inputs?.meteo_data?.radiation_db ??
    json.meta?.inputs?.meteo_data?.radiation_db ??
    null;
  if (!db) return "PVGIS v5.3";
  return db.toUpperCase().startsWith("PVGIS") ? db : `PVGIS ${db}`;
}
