import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, CircleAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StepShell } from "@/components/StepShell";
import { useAppLocale } from "@/hooks/use-app-locale";
import { formatDecimal, parseLocaleNumber } from "@/lib/format";
import { sanitizeNumericInput } from "@/lib/numeric-input";
import {
  defaultGridProfileFor,
  getConnectionConfig,
  type ConnectionOption,
} from "@/config/connections";
import {
  CAPACITY_BOUNDS,
  connectionCapacityAmount,
  connectionCapacityToMaxAcPowerKw,
  connectionCapacityUnit,
  isValidConnectionCapacity,
  FALLBACK_INPUT_TYPES,
  type ConnectionCapacity,
  type ConnectionCapacityInputType,
} from "@/config/connection-capacity";
import { connectionOptionLabel } from "@/lib/connection-display";
import {
  GRID_FREQUENCY_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  isPresetVoltage,
  isValidCustomVoltage,
  splitPhaseLineToNeutral,
  voltageForPhaseChoice,
  voltageForServiceSwitch,
  voltageOptionsForService,
  type ServiceType,
} from "@/config/grid";
import { useWizardStore } from "@/state/wizard-store";
import { haptic } from "@/services/native-service";

/** Phase models offered by the explicit phase choice (ampere markets). */
const PHASE_CHOICE_OPTIONS: readonly ServiceType[] = ["single-phase", "three-phase"];

interface FuseStepProps {
  totalSteps: number;
  onBack: () => void;
  onSubmit: () => void;
}

export function FuseStep({ totalSteps, onBack, onSubmit }: FuseStepProps) {
  const { t } = useTranslation();
const [showGridInfo, setShowGridInfo] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [editGrid, setEditGrid] = useState(false);
  const { locale } = useAppLocale();
  const location = useWizardStore((s) => s.location);
  const storedCapacity = useWizardStore((s) => s.connectionCapacity);
  const setConnectionCapacity = useWizardStore((s) => s.setConnectionCapacity);
  const selectConnectionOption = useWizardStore((s) => s.selectConnectionOption);
  const gridConfirmed = useWizardStore((s) => s.gridConfirmed);
  const setGridConfirmed = useWizardStore((s) => s.setGridConfirmed);
  const serviceType = useWizardStore((s) => s.gridServiceType);
  const voltageV = useWizardStore((s) => s.gridVoltageV);
  const lineToNeutralVoltageV = useWizardStore((s) => s.gridLineToNeutralVoltageV);
  const frequencyHz = useWizardStore((s) => s.gridFrequencyHz);
  const setGridProfile = useWizardStore((s) => s.setGridProfile);
  const setGridDefaults = useWizardStore((s) => s.setGridDefaults);

  const connection = getConnectionConfig(location?.countryCode);
  const storedCapacityType = storedCapacity?.type ?? null;
  const countryCode = location?.countryCode?.toUpperCase();
  const countryFlag = countryCode
    ? String.fromCodePoint(...[...countryCode].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : "";
  const countryName = (() => {
    if (!countryCode) return "";
    try {
      return (
        new Intl.DisplayNames([locale], { type: "region" }).of(countryCode) ?? countryCode
      );
    } catch {
      return countryCode;
    }
  })();


  // The country decides the initial grid profile; a manual override wins.
  useEffect(() => {
    setGridDefaults(defaultGridProfileFor(connection));
  }, [connection.countryCode, setGridDefaults]); // eslint-disable-line react-hooks/exhaustive-deps
  // The generic fallback lets the user state the connection in the unit they
  // actually have on their contract: A, kW or kVA. Verified profiles keep the
  // country's own unit — this selector never applies to them.
  const [fallbackInputType, setFallbackInputType] = useState<ConnectionCapacityInputType>(
    () =>
      connection.status !== "verified" && storedCapacityType
        ? storedCapacityType
        : connection.capacityInputType,
  );
  const inputType =
    connection.status === "verified" ? connection.capacityInputType : fallbackInputType;
  const unit = connectionCapacityUnit(inputType);
  const bounds = CAPACITY_BOUNDS[inputType];

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (!storedCapacity) return connection.defaultConnection;
    const match = connection.connectionOptions.find(
      (option) =>
        option.capacity.type === storedCapacity.type &&
        connectionCapacityAmount(option.capacity) ===
          connectionCapacityAmount(storedCapacity) &&
        // Voltage identifies an ampere option (BE 3x230 vs 3N400). Contracted
        // kVA/kW options are grid-independent totals, so voltage is ignored —
        // otherwise a persisted value from an older build would look "custom".
        (option.capacity.type !== "amperage" ||
          (option.capacity.voltageV ?? null) === (storedCapacity.voltageV ?? null)),
    );

    return match?.id ?? null;
  });
  const [custom, setCustom] = useState(
    connection.connectionOptions.length === 0 || (storedCapacity !== null && selectedId === null),
  );
  const [customValue, setCustomValue] = useState(
    custom && storedCapacity ? String(connectionCapacityAmount(storedCapacity)) : "",
  );

  // Custom voltage: an extra option after the presets, using the same
  // voltage value in the existing power formula.
  const [customVoltage, setCustomVoltage] = useState(!isPresetVoltage(voltageV, serviceType));
  const [customVoltageValue, setCustomVoltageValue] = useState(
    isPresetVoltage(voltageV, serviceType) ? "" : String(voltageV),
  );
  const parsedCustomVoltage = parseLocaleNumber(customVoltageValue, locale);
  const customVoltageValid = isValidCustomVoltage(parsedCustomVoltage);
  const voltageValid = !customVoltage || customVoltageValid;

  /**
   * Builds the capacity for a given amount in the country's own unit.
   * A country option always carries its OWN grid profile — that is what makes
   * "3 x 25 A" mean the same thing as the country defines it. Manual amounts
   * use whatever profile is currently set in the advanced settings.
   */
  const capacityFor = (amount: number, option?: ConnectionOption): ConnectionCapacity => {
    const profile = option
      ? {
          serviceType: option.capacity.serviceType ?? serviceType,
          voltageV: option.capacity.voltageV ?? voltageV,
          lineToNeutralVoltageV: option.capacity.lineToNeutralVoltageV ?? null,
          frequencyHz: option.capacity.frequencyHz ?? frequencyHz,
        }
      : { serviceType, voltageV, lineToNeutralVoltageV, frequencyHz };
    if (inputType === "contracted-kva") return { type: "contracted-kva", kva: amount, ...profile };
    if (inputType === "contracted-kw") return { type: "contracted-kw", kw: amount, ...profile };
    return { type: "amperage", amperageA: amount, ...profile };
  };


  const selectedOption = connection.connectionOptions.find((o) => o.id === selectedId) ?? null;
  const customAmount = parseLocaleNumber(customValue, locale) ?? 0;
  const capacity: ConnectionCapacity | null = custom
    ? capacityFor(customAmount)
    : selectedOption
      ? capacityFor(connectionCapacityAmount(selectedOption.capacity), selectedOption)
      : storedCapacity;

  // A generic/unsupported country profile is not a local standard. The user
  // must confirm the grid data before the calculation may use it.
  const isVerified = connection.status === "verified";
  const capacityValid =
    isValidConnectionCapacity(capacity) && voltageValid && (isVerified || gridConfirmed);
  const maxAc = capacity
    ? connectionCapacityToMaxAcPowerKw(capacity, {
        ...(connection.contractedKvaPowerFactor === undefined
          ? {}
          : { contractedKvaPowerFactor: connection.contractedKvaPowerFactor }),
      })
    : 0;

  // A per-phase prefix ("3 x ") is only meaningful for amperes. Contracted
  // kVA/kW are totals and must never be rendered as a per-phase product.
  const optionLabel = (option: ConnectionOption) =>
    connectionOptionLabel(option, (amount, decimals) =>
      formatDecimal(amount, locale, decimals),
    );


  const serviceLabel = (type: ServiceType) =>
    t(
      type === "single-phase"
        ? "fuse.grid.phase1"
        : type === "two-phase"
          ? "fuse.grid.twoPhase"
          : type === "three-phase"
            ? "fuse.grid.phase3"
            : "fuse.grid.splitPhase",
    );
  /** Split-phase is displayed as "120/240 V" — the 240 V drives the power. */
  const voltageLabel = (value: number) =>
    serviceType === "split-phase"
      ? `${splitPhaseLineToNeutral(value)}/${value} V`
      : `${value} V`;

  // Ampere markets where both 1- and 3-phase are normal ask for the phase
  // model explicitly: an ampere figure alone has no correct AC meaning.
  const showPhaseChoice = inputType === "amperage" && (connection.phaseChoice ?? false);

  /** The premise the calculation actually uses, e.g. "3-phase · 400 V · 35 A". */
  const resolvedConnectionLabel = !capacity
    ? null
    : capacity.type === "amperage"
      ? `${serviceLabel(serviceType)} · ${voltageLabel(voltageV)} · ${formatDecimal(
          connectionCapacityAmount(capacity),
          locale,
          0,
        )} A`
      : `${formatDecimal(connectionCapacityAmount(capacity), locale, 2)} ${connectionCapacityUnit(
          capacity.type,
        )}${
          capacity.type === "contracted-kva"
            ? ` · PF ${formatDecimal(connection.contractedKvaPowerFactor ?? 1, locale, 2)}`
            : ""
        }`;

  const chipClass = (active: boolean) =>
    active
      ? "chip-selected min-h-11 rounded-[10px] px-2 py-1.5 text-xs font-bold text-brand-black shadow-sm transition-colors"
      : "chip-unselected min-h-11 rounded-[10px] px-2 py-1.5 text-xs font-medium transition-colors";

  return (
    <StepShell
      step={4}
      totalSteps={totalSteps}
      title={isVerified ? t(connection.questionKey) : t("fuse.genericTitle")}
      onBack={onBack}
      footer={
        <Button
          className="h-auto w-full rounded-[24px] py-4 text-base font-bold shadow-cta"
          variant="cta"
          size="lg"
          disabled={!capacityValid}
          onClick={() => {
            void haptic("success");
            if (!custom && selectedOption) {
              selectConnectionOption(
                selectedOption.id,
                capacity!,
                selectedOption.impliedServiceType,
              );
            } else {
              setConnectionCapacity(capacity);
            }
            onSubmit();
          }}
        >
          {t("fuse.calculate")}
          <ArrowRight className="size-4 text-accent" />
        </Button>
      }
    >
      <h2 className="text-xs font-bold tracking-widest text-primary/70 uppercase">
        {t("fuse.grid.advanced")}
      </h2>

      {/* 1. Nätinställningar — grid profile first */}
      <div className="glass-primary relative space-y-3 rounded-[28px] px-4 py-4">
        {/* Same info affordance as the other steps: top-right corner of the card. */}
        <button
          type="button"
          onClick={() => {
            void haptic("light");
            setShowGridInfo((open) => !open);
          }}
          aria-label={t("fuse.gridAssumptionDynamic", {
            service: serviceLabel(serviceType),
            voltage: voltageLabel(voltageV),
          })}
          aria-expanded={showGridInfo}
          className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white"
        >
          <CircleAlert className="size-3.5" />
        </button>
        <div className="flex items-center justify-between gap-3 pr-7">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">{t("fuse.grid.section")}</p>
            <p className="truncate text-[11px] text-white/70">
              {`${serviceLabel(serviceType)} · ${voltageLabel(voltageV)} · ${frequencyHz} Hz`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {countryCode ? (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex cursor-default items-center gap-1 rounded-full border border-brand-black/22 bg-surface-cream px-2 py-1 text-[10px] font-semibold text-brand-black"
              >
                <span aria-hidden="true">{countryFlag}</span>
                <span className="max-w-[90px] truncate">{countryName}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void haptic("light");
                setEditGrid((open) => !open);
              }}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-accent-foreground shadow-sm"
            >
              {editGrid ? t("fuse.grid.done") : t("fuse.grid.change")}
            </button>
          </div>
        </div>


        {editGrid ? (
          <div className="space-y-3 rounded-2xl bg-white/10 px-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-white/70">{t("fuse.grid.serviceType")}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {SERVICE_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setCustomVoltage(false);
                      setGridProfile({
                        serviceType: option,
                        voltageV: voltageForServiceSwitch(option, voltageV),
                      });
                    }}
                    className={chipClass(serviceType === option)}
                  >
                    {serviceLabel(option)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-white/70">{t("fuse.grid.voltage")}</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {voltageOptionsForService(serviceType).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setCustomVoltage(false);
                      setGridProfile({ voltageV: option });
                    }}
                    className={chipClass(!customVoltage && voltageV === option)}
                  >
                    {voltageLabel(option)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCustomVoltage(true);
                    if (customVoltageValid) setGridProfile({ voltageV: parsedCustomVoltage! });
                  }}
                  className={chipClass(customVoltage)}
                >
                  {t("fuse.grid.voltageOther")}
                </button>
              </div>

              {customVoltage ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="custom-voltage" className="text-[11px] text-white/70">
                      {t("fuse.grid.voltageOtherLabel")}
                    </Label>
                    <Input
                      id="custom-voltage"
                      type="text"
                      inputMode="decimal"
                      value={customVoltageValue}
                      onChange={(event) => {
                        const raw = sanitizeNumericInput(event.target.value);
                        setCustomVoltageValue(raw);
                        const parsed = parseLocaleNumber(raw, locale);
                        if (isValidCustomVoltage(parsed)) setGridProfile({ voltageV: parsed! });
                      }}
                      className="h-8 w-20 rounded-full border-white/25 bg-white/15 text-xs text-white placeholder:text-white/50"
                    />
                    <span className="text-xs text-white/60">V</span>
                  </div>
                  {!customVoltageValid ? (
                    <p className="text-[11px] text-red-200">{t("fuse.grid.voltageInvalid")}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-white/70">{t("fuse.grid.frequency")}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {GRID_FREQUENCY_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setGridProfile({ frequencyHz: option })}
                    className={chipClass(frequencyHz === option)}
                  >
                    {option} Hz
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-white/60">
              {isVerified ? t("fuse.grid.hint") : t("fuse.grid.unverifiedHint")}
            </p>
          </div>
        ) : null}

        {showGridInfo ? (
          <p className="text-[11px] leading-relaxed text-white/60">
            {`${t("fuse.gridAssumptionDynamic", {
              service: serviceLabel(serviceType),
              voltage: voltageLabel(voltageV),
            })} ${t("fuse.gridCheckHint")}`}
          </p>
        ) : null}
      </div>

      {/* 2. Säkring — capacity selection */}
      <div className="glass-primary space-y-3 rounded-[28px] px-4 py-4">
        {showPhaseChoice ? (
          <div className="space-y-1.5">
            <Label className="text-xs text-white">{t("fuse.grid.serviceType")}</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {PHASE_CHOICE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    void haptic("light");
                    setCustomVoltage(false);
                    // An explicit phase choice always snaps the voltage to that
                    // service's nominal value: 230 V LN / 400 V LL.
                    setGridProfile({
                      serviceType: option,
                      voltageV: voltageForPhaseChoice(option),
                    });
                  }}
                  className={chipClass(serviceType === option)}
                >
                  {serviceLabel(option)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!isVerified ? (
          <div className="space-y-1.5">
            <Label className="text-xs text-white">{t("fuse.capacity.inputUnit")}</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {FALLBACK_INPUT_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    void haptic("light");
                    if (option === inputType) return;
                    // A new unit is a new statement: clear the amount and the
                    // earlier confirmation.
                    setFallbackInputType(option);
                    setSelectedId(null);
                    setCustomValue("");
                    setCustom(true);
                    setConnectionCapacity(null);
                    setGridConfirmed(false);
                  }}
                  className={chipClass(inputType === option)}
                >
                  {connectionCapacityUnit(option)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <Label className="text-xs text-white">
            {connection.localTerm && isVerified
              ? connection.localTerm
              : t(`fuse.capacity.${inputType}.label`)}
          </Label>
          <p className="text-[11px] text-white/70">{t(connection.helpTextKey)}</p>
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {connection.connectionOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                void haptic("light");
                setCustom(false);
                setSelectedId(option.id);
                selectConnectionOption(
                  option.id,
                  capacityFor(connectionCapacityAmount(option.capacity), option),
                  option.impliedServiceType,
                );
              }}
              className={chipClass(!custom && selectedId === option.id)}
            >
              {optionLabel(option)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              void haptic("light");
              // "Other" always opens an EMPTY field in the country's own unit —
              // never prefilled with a previous or standard value.
              setSelectedId(null);
              setCustomValue("");
              setCustom(true);
            }}
            className={chipClass(custom)}
          >
            {t("fuse.other")}
          </button>
        </div>

        {!isVerified ? (
          <div className="space-y-2 rounded-2xl border border-accent/40 bg-accent/10 px-3 py-2">
            <p className="text-[11px] leading-relaxed text-white/80">
              {t("fuse.unverifiedCountryNotice")}
            </p>
            <button
              type="button"
              onClick={() => {
                void haptic("light");
                setGridConfirmed(!gridConfirmed);
              }}
              className={chipClass(!gridConfirmed)}
            >
              {gridConfirmed ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Check className="size-3.5" strokeWidth={3} />
                  {t("fuse.confirmedGrid")}
                </span>
              ) : (
                t("fuse.confirmGrid")
              )}
            </button>
          </div>
        ) : null}

        {custom ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="custom-capacity" className="text-xs text-white/70">
              {t("fuse.capacity.otherLabel")}
            </Label>
            <Input
              id="custom-capacity"
              type="text"
              inputMode="decimal"
              value={customValue}
              onChange={(event) => {
                const raw = sanitizeNumericInput(event.target.value);
                setCustomValue(raw);
                // Persist as the user types so the premise the engine uses is
                // always the one shown — and so confirming later confirms it.
                const parsed = parseLocaleNumber(raw, locale);
                const next = parsed === null ? null : capacityFor(parsed);
                setConnectionCapacity(isValidConnectionCapacity(next) ? next : null);
              }}
              className="h-8 w-20 rounded-full border-white/25 bg-white/15 text-xs text-white placeholder:text-white/50"
            />
            <span className="text-xs text-white/60">{unit}</span>
          </div>
        ) : null}

        {custom && customValue !== "" && !capacityValid ? (
          <p className="text-xs text-red-200">
            {t("fuse.capacity.invalid", { min: bounds.min, max: bounds.max, unit })}
          </p>
        ) : null}
      </div>

      {/* 3. Resultat — own card */}
      {capacityValid ? (
        <div className="glass-primary space-y-1.5 rounded-[28px] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs text-white/60">
              <Zap className="size-3.5 text-accent" />
              {t("fuse.maxAc")}
            </span>
            <span className="text-base font-bold text-white">
              {formatDecimal(maxAc, locale, 2)}{" "}
              <span className="text-[11px] font-normal text-white/60">kW</span>
            </span>
          </div>
        </div>
      ) : null}

      {/* 5. Viktigt att veta — own card */}
      <div className="glass-primary rounded-[28px] px-4 py-3">
        <button
          type="button"
          onClick={() => setShowDisclaimer((open) => !open)}
          className="flex items-start gap-2 text-left text-xs text-white/60"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-accent" />
          <span>{t("fuse.disclaimerTitle")}</span>
        </button>
        {showDisclaimer ? (
          <p className="mt-2 pl-5 text-[11px] leading-relaxed whitespace-pre-line text-white/60">
            {t("fuse.disclaimer")}
          </p>
        ) : null}
      </div>
    </StepShell>
  );
}
