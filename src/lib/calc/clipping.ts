/**
 * Inverter clipping (AC power limiting) from real hourly data.
 *
 * Why this exists: production is modelled as `monthlyKwhPerKwp x installedKwp`,
 * which is a DC-side quantity scaled by PVGIS' system losses. It contains no
 * inverter power limit at all, so a 12.9 kWp array produced exactly the same
 * energy on a 10 kW and on a 15 kW inverter. That is wrong whenever the array
 * really does drive the inverter into its AC limit.
 *
 * What is modelled: for every hour of a real PVGIS hourly year the array's
 * output is compared with the inverter's rated AC power and the excess is
 * removed. Nothing is estimated with a coefficient.
 *
 * Scale invariance: both the array output and the inverter limit are linear in
 * system size, so the clipped FRACTION depends only on the DC/AC ratio (and the
 * site's hourly shape), never on the absolute size. That is why the loss is
 * expressed as a share per month and can be reused for any system with the same
 * ratio at the same location and orientation.
 *
 * Known limitations (deliberate, documented):
 *   - one calendar year of hourly data, not a long-term average
 *   - the inverter's rated AC power is treated as a hard ceiling; real products
 *     may allow brief overload or derate on temperature
 *   - PVGIS' 14 % system loss is already included in the hourly power, so the
 *     ceiling is applied to an AC-side quantity
 */

/** One hourly PVGIS sample: AC power (W) for a 1 kWp reference system. */
export interface HourlyPowerSample {
  /** PVGIS time stamp, e.g. "20200105:0411". */
  time: string;
  /** AC power in W for a 1 kWp system. */
  powerW: number;
}

export interface ClippingLossModel {
  /** DC/AC ratio the shares were computed for. */
  dcAcRatio: number;
  /** 12 values, January..December: clipped share of that month's production. */
  monthlyLossShare: number[];
  /** Clipped share of the whole year's production. */
  annualLossShare: number;
  /** Hourly data source label, e.g. "PVGIS-SARAH3". */
  dataSource: string;
  /** Calendar year of the hourly data used. */
  year: number;
}

const MONTHS = 12;

function monthIndexFromPvgisTime(time: string): number | null {
  // "YYYYMMDD:HHMM"
  if (time.length < 6) return null;
  const month = Number(time.slice(4, 6));
  if (!Number.isFinite(month) || month < 1 || month > MONTHS) return null;
  return month - 1;
}

/**
 * Clipped share per month for a given DC/AC ratio.
 *
 * Per kW of inverter AC power the array delivers `powerPerKwp x dcAcRatio`;
 * everything above 1.0 kW per kW of inverter cannot pass the inverter.
 */
export function computeClippingLoss(params: {
  hourly: HourlyPowerSample[];
  dcAcRatio: number;
  dataSource: string;
  year: number;
}): ClippingLossModel {
  const { hourly, dcAcRatio, dataSource, year } = params;
  const produced = new Array<number>(MONTHS).fill(0);
  const clipped = new Array<number>(MONTHS).fill(0);

  const ratio = Number.isFinite(dcAcRatio) && dcAcRatio > 0 ? dcAcRatio : 0;

  for (const sample of hourly) {
    const monthIndex = monthIndexFromPvgisTime(sample.time);
    if (monthIndex === null) continue;
    if (!Number.isFinite(sample.powerW) || sample.powerW <= 0) continue;
    // kW per kW of inverter AC power, for one hour -> kWh per kW.
    const arrayKw = (sample.powerW / 1000) * ratio;
    produced[monthIndex] = (produced[monthIndex] ?? 0) + arrayKw;
    if (arrayKw > 1) clipped[monthIndex] = (clipped[monthIndex] ?? 0) + (arrayKw - 1);
  }

  const monthlyLossShare = produced.map((monthProduced, index) => {
    if (!(monthProduced > 0)) return 0;
    const share = (clipped[index] ?? 0) / monthProduced;
    return share > 0 ? Math.min(share, 1) : 0;
  });

  const totalProduced = produced.reduce((sum, value) => sum + value, 0);
  const totalClipped = clipped.reduce((sum, value) => sum + value, 0);
  const annualLossShare = totalProduced > 0 ? Math.min(totalClipped / totalProduced, 1) : 0;

  return { dcAcRatio: ratio, monthlyLossShare, annualLossShare, dataSource, year };
}

/** Tolerance when reusing a loss model for a system's actual DC/AC ratio. */
export const CLIPPING_RATIO_TOLERANCE = 0.005;

export function clippingModelMatchesRatio(
  model: Pick<ClippingLossModel, "dcAcRatio">,
  dcAcRatio: number,
): boolean {
  return Math.abs(model.dcAcRatio - dcAcRatio) <= CLIPPING_RATIO_TOLERANCE;
}

/** Apply the model's monthly shares to a monthly production series (kWh). */
export function applyClippingLoss(
  monthlyProductionKwh: number[],
  monthlyLossShare: number[],
): { monthlyProductionKwh: number[]; clippedKwh: number } {
  let clippedKwh = 0;
  const result = monthlyProductionKwh.map((value, index) => {
    const share = monthlyLossShare[index] ?? 0;
    if (!(value > 0) || !(share > 0)) return value;
    const loss = value * Math.min(share, 1);
    clippedKwh += loss;
    return value - loss;
  });
  return { monthlyProductionKwh: result, clippedKwh };
}
