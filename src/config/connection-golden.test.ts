/**
 * GOLDEN INVARIANTS for the connection/subscription layer.
 *
 * This suite is deliberately table driven over EVERY market profile that
 * exists at runtime — verified, generic and the fallback — so a newly added
 * market cannot ship without its connection model being validated.
 *
 * The one rule it protects:
 *
 *   amperage        -> phases and voltage DO change the power
 *                      1-phase / split-phase: U x I x PF / 1000
 *                      3-phase:               sqrt(3) x U x I x PF / 1000
 *   contracted-kva  -> total. maxAcKw = kVA x PF, independent of phases/voltage
 *   contracted-kw   -> total. maxAcKw = kW,       independent of phases/voltage
 *
 * sqrt(3) may only ever touch three-phase AMPERE input.
 */

import { describe, expect, it } from "vitest";
import {
  COUNTRY_CONNECTION_CONFIGS,
  GENERIC_CONNECTION_CONFIGS,
  fallbackConnectionConfig,
  getConnectionConfig,
  type CountryConnectionConfig,
} from "./connections";
import {
  connectionCapacityAmount,
  connectionCapacityToMaxAcPowerKw,
  connectionCapacityUnit,
  type ConnectionCapacity,
} from "./connection-capacity";
import {
  connectionOptionLabel,
  connectionOptionPrefix,
  gridAcDisplayFactor,
  gridMethodNoteKind,
} from "@/lib/connection-display";
import { SERVICE_TYPE_AC_FACTOR, type ServiceType } from "./grid";
import { sv } from "@/i18n/locales/sv";
import { en } from "@/i18n/locales/en";
import { fr } from "@/i18n/locales/fr";

/** Every profile the app can hand to step 4 — new markets are picked up here. */
const ALL_PROFILES: Array<[string, CountryConnectionConfig]> = [
  ...Object.entries(COUNTRY_CONNECTION_CONFIGS),
  ...Object.entries(GENERIC_CONNECTION_CONFIGS),
  ["__fallback__", fallbackConnectionConfig("ZZ")],
];

const kw = (capacity: ConnectionCapacity, powerFactor?: number) =>
  connectionCapacityToMaxAcPowerKw(
    capacity,
    powerFactor === undefined ? {} : { contractedKvaPowerFactor: powerFactor },
  );

const GRID_VARIANTS: Array<{ serviceType: ServiceType; voltageV: number }> = [
  { serviceType: "single-phase", voltageV: 230 },
  { serviceType: "single-phase", voltageV: 120 },
  { serviceType: "three-phase", voltageV: 400 },
  { serviceType: "three-phase", voltageV: 230 },
  { serviceType: "split-phase", voltageV: 240 },
];

describe("golden connection invariants — every market profile", () => {
  it("covers every profile the app can resolve", () => {
    expect(ALL_PROFILES.length).toBeGreaterThanOrEqual(
      Object.keys(COUNTRY_CONNECTION_CONFIGS).length + 1,
    );
    for (const [code, config] of ALL_PROFILES) {
      if (code === "__fallback__") continue;
      expect(getConnectionConfig(code)).toEqual(config);
    }
  });

  it.each(ALL_PROFILES)("%s: every option matches the profile input type", (_code, config) => {
    for (const option of config.connectionOptions) {
      expect(option.capacity.type).toBe(config.capacityInputType);
    }
  });

  it.each(ALL_PROFILES)("%s: displayed unit follows the input type", (_code, config) => {
    const expectedUnit =
      config.capacityInputType === "amperage"
        ? "A"
        : config.capacityInputType === "contracted-kva"
          ? "kVA"
          : "kW";
    expect(connectionCapacityUnit(config.capacityInputType)).toBe(expectedUnit);
    for (const option of config.connectionOptions) {
      const label = connectionOptionLabel(option, (amount, decimals) => amount.toFixed(decimals));
      expect(label.endsWith(` ${expectedUnit}`)).toBe(true);
      // No "3 x" style multiplier may ever appear on a contracted total.
      if (config.capacityInputType !== "amperage") {
        expect(label).not.toMatch(/[0-9]\s*[x×*]\s*[0-9]/i);
        expect(connectionOptionPrefix(option)).toBe("");
      }
    }
  });

  it.each(ALL_PROFILES)(
    "%s: contracted kVA/kW options carry no prefix, phases or voltage",
    (_code, config) => {
      if (config.capacityInputType === "amperage") return;
      for (const option of config.connectionOptions) {
        expect(option.phasePrefix).toBeUndefined();
        expect(option.capacity.serviceType).toBeUndefined();
        expect(option.capacity.voltageV).toBeUndefined();
        expect(option.capacity.frequencyHz).toBeUndefined();
        expect(option.capacity.lineToNeutralVoltageV).toBeUndefined();
      }
    },
  );

  it.each(ALL_PROFILES)("%s: the golden maths holds for every option", (_code, config) => {
    const pf = config.contractedKvaPowerFactor ?? 1;
    for (const option of config.connectionOptions) {
      const amount = connectionCapacityAmount(option.capacity);
      const actual = kw(option.capacity, config.contractedKvaPowerFactor);

      if (option.capacity.type === "amperage") {
        const factor = SERVICE_TYPE_AC_FACTOR[option.capacity.serviceType];
        expect(actual).toBeCloseTo((factor * option.capacity.voltageV * amount) / 1000, 9);
        // sqrt(3) only on real three-phase.
        if (option.capacity.serviceType !== "three-phase") {
          expect(factor).toBe(1);
        }
      } else if (option.capacity.type === "contracted-kva") {
        expect(actual).toBeCloseTo(amount * pf, 9);
      } else {
        expect(actual).toBe(amount);
      }
    }
  });

  it.each(ALL_PROFILES)(
    "%s: contracted totals never change with phases or voltage",
    (_code, config) => {
      if (config.capacityInputType === "amperage") return;
      for (const option of config.connectionOptions) {
        const amount = connectionCapacityAmount(option.capacity);
        const values = GRID_VARIANTS.map((grid) =>
          kw({ ...option.capacity, ...grid, frequencyHz: 50 } as ConnectionCapacity,
            config.contractedKvaPowerFactor),
        );
        for (const value of values) {
          expect(value).toBeCloseTo(values[0]!, 9);
          expect(value).toBeLessThanOrEqual(amount + 1e-9);
        }
      }
    },
  );

  it.each(ALL_PROFILES)(
    "%s: ampere options DO react to a phase change",
    (_code, config) => {
      if (config.capacityInputType !== "amperage") return;
      for (const option of config.connectionOptions) {
        const amount = connectionCapacityAmount(option.capacity);
        const single = kw({
          type: "amperage",
          amperageA: amount,
          serviceType: "single-phase",
          voltageV: 230,
          frequencyHz: 50,
        });
        const three = kw({
          type: "amperage",
          amperageA: amount,
          serviceType: "three-phase",
          voltageV: 230,
          frequencyHz: 50,
        });
        expect(three / single).toBeCloseTo(Math.sqrt(3), 9);
      }
    },
  );

  it.each(ALL_PROFILES)("%s: no forced preselected connection", (_code, config) => {
    expect(config.defaultConnection).toBeNull();
    const ids = config.connectionOptions.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ------------------------------ FR (kVA) -------------------------------- */

describe("France — subscribed kVA is always a total", () => {
  it.each([
    ["single-phase", 230, 6, 1, 6],
    ["single-phase", 230, 9, 1, 9],
    ["three-phase", 400, 9, 1, 9],
    ["three-phase", 400, 18, 1, 18],
    ["three-phase", 400, 9, 0.95, 8.55],
    ["single-phase", 230, 9, 0.95, 8.55],
  ] as const)(
    "FR %s %s V / %s kVA / PF %s -> %s kW",
    (serviceType, voltageV, kva, pf, expected) => {
      expect(
        kw({ type: "contracted-kva", kva, serviceType, voltageV, frequencyHz: 50 }, pf),
      ).toBeCloseTo(expected, 6);
    },
  );

  it("9 kVA can never become 27 kW", () => {
    const single = kw({ type: "contracted-kva", kva: 9, serviceType: "single-phase", voltageV: 230, frequencyHz: 50 });
    const three = kw({ type: "contracted-kva", kva: 9, serviceType: "three-phase", voltageV: 400, frequencyHz: 50 });
    expect(single).toBe(three);
    expect(three).toBe(9);
  });

  it("shows the regulated kVA steps with no per-phase multiplier", () => {
    const labels = getConnectionConfig("FR").connectionOptions.map((o) =>
      connectionOptionLabel(o, (amount, decimals) => amount.toFixed(decimals)),
    );
    expect(labels).toEqual([
      "3 kVA",
      "6 kVA",
      "9 kVA",
      "12 kVA",
      "15 kVA",
      "18 kVA",
      "24 kVA",
      "30 kVA",
      "36 kVA",
    ]);
    for (const label of labels) {
      expect(label).not.toMatch(/3\s*[x×]\s*/i);
    }
  });
});

/* ---------------------------- ampere markets ---------------------------- */

describe("ampere markets — phases and voltage drive the maths", () => {
  it("a real single-phase market: 230 V / 20 A / PF 1 -> 4.60 kW", () => {
    expect(
      kw({ type: "amperage", amperageA: 20, serviceType: "single-phase", voltageV: 230, frequencyHz: 50 }),
    ).toBeCloseTo(4.6, 6);
    expect(getConnectionConfig("GB").defaultServiceType).toBe("single-phase");
  });

  it("a real three-phase market: 400 V / 20 A / PF 1 -> ~13.856 kW", () => {
    expect(
      kw({ type: "amperage", amperageA: 20, serviceType: "three-phase", voltageV: 400, frequencyHz: 50 }),
    ).toBeCloseTo(13.8564, 3);
    expect(getConnectionConfig("SE").defaultServiceType).toBe("three-phase");
  });

  it("switching phases changes the ampere result", () => {
    const single = kw({ type: "amperage", amperageA: 25, serviceType: "single-phase", voltageV: 400, frequencyHz: 50 });
    const three = kw({ type: "amperage", amperageA: 25, serviceType: "three-phase", voltageV: 400, frequencyHz: 50 });
    expect(three).not.toBeCloseTo(single, 3);
    expect(three / single).toBeCloseTo(Math.sqrt(3), 9);
  });
});

/* ------------------------------ kW markets ------------------------------ */

describe("contracted kW markets — the value is used verbatim", () => {
  it.each([
    ["single-phase", 230],
    ["three-phase", 400],
    ["three-phase", 230],
    ["split-phase", 240],
  ] as const)("10 kW on %s %s V stays 10 kW", (serviceType, voltageV) => {
    expect(kw({ type: "contracted-kw", kw: 10, serviceType, voltageV, frequencyHz: 50 })).toBe(10);
  });

  it("ES and IT options are read as kW totals", () => {
    for (const country of ["ES", "IT"]) {
      for (const option of getConnectionConfig(country).connectionOptions) {
        expect(option.capacity.type).toBe("contracted-kw");
        expect(kw(option.capacity)).toBe(connectionCapacityAmount(option.capacity));
      }
    }
  });
});

/* ---------------------- help text / PDF method note --------------------- */

describe("method notes follow the actual state, not a fixed 400 V assumption", () => {
  it("the PDF note kind is chosen by input type first", () => {
    expect(
      gridMethodNoteKind({ inputType: "contracted-kva", serviceType: "three-phase", voltageV: 400 }),
    ).toBe("contracted");
    expect(
      gridMethodNoteKind({ inputType: "contracted-kw", serviceType: "single-phase", voltageV: 230 }),
    ).toBe("contracted");
    expect(
      gridMethodNoteKind({ inputType: "amperage", serviceType: "three-phase", voltageV: 400 }),
    ).toBe("default");
    expect(
      gridMethodNoteKind({ inputType: "amperage", serviceType: "single-phase", voltageV: 230 }),
    ).toBe("dynamic");
    expect(
      gridMethodNoteKind({ inputType: "amperage", serviceType: "split-phase", voltageV: 240 }),
    ).toBe("dynamic");
  });

  it("the ampere display factor is sqrt(3)-rounded only for three-phase", () => {
    expect(gridAcDisplayFactor("three-phase")).toBe(1.73);
    expect(gridAcDisplayFactor("single-phase")).toBe(1);
    expect(gridAcDisplayFactor("split-phase")).toBe(1);
    expect(gridAcDisplayFactor(null)).toBe(1);
  });
});

/* ------------------------- grid help text (i18n) ------------------------ */

describe("step 4 help text always describes the current grid settings", () => {
  /** Same interpolation i18next performs, kept dependency free. */
  const interpolate = (template: string, vars: Record<string, string>) =>
    template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? "");

  const templates: Array<[string, string]> = [
    ["sv", sv.fuse.gridAssumptionDynamic],
    ["en", en.fuse.gridAssumptionDynamic],
    ["fr", fr.fuse.gridAssumptionDynamic],
  ];

  it.each(templates)("%s: the template is fully parameterised", (_lang, template) => {
    expect(template).toContain("{{service}}");
    expect(template).toContain("{{voltage}}");
    // No hardcoded reference grid anywhere in the sentence.
    expect(template).not.toMatch(/400/);
    expect(template).not.toMatch(/230/);
  });

  it.each(templates)("%s: 1-phase 230 V never renders a 3-phase 400 V claim", (_lang, template) => {
    const text = interpolate(template, { service: "1-fas", voltage: "230 V" });
    expect(text).toContain("230 V");
    expect(text).not.toContain("400");
    expect(text).not.toContain("3-fas");
  });

  it.each(templates)("%s: 3-phase 400 V renders the 3-phase text", (_lang, template) => {
    const text = interpolate(template, { service: "3-fas", voltage: "400 V" });
    expect(text).toContain("400 V");
    expect(text).toContain("3-fas");
  });

  it("the generic check hint exists separately and states no grid values", () => {
    for (const hint of [
      sv.fuse.gridCheckHint,
      en.fuse.gridCheckHint,
      fr.fuse.gridCheckHint,
    ]) {
      expect(hint.length).toBeGreaterThan(0);
      expect(hint).not.toMatch(/400|230|1[,.]73/);
    }
  });

  it("the contracted PDF note never describes the fuse formula", () => {
    for (const note of [
      sv.pdf.gridMethodNoteContracted,
      en.pdf.gridMethodNoteContracted,
      fr.pdf.gridMethodNoteContracted,
    ]) {
      expect(note).not.toMatch(/1[,.]73|400\s*V|kVA\s*[x×]/i);
    }
  });
});
