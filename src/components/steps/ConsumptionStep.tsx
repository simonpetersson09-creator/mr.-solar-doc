import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, FileUp, Loader2, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StepShell } from "@/components/StepShell";
import { ConsumptionShapePicker } from "@/components/ConsumptionShapePicker";
import { MonthlyChart } from "@/components/MonthlyChart";
import { getMarketConfig } from "@/config/markets";
import type { ConsumptionShape } from "@/lib/calc/consumption-shape";
import { estimateMonthlyConsumption } from "@/lib/calc/consumption-shape";
import { useAppLocale } from "@/hooks/use-app-locale";
import { formatNumber, parseLocaleNumber } from "@/lib/format";
import { sanitizeNumericInput } from "@/lib/numeric-input";
import { sumMonthly } from "@/lib/calc/energy-production";
import { useWizardStore } from "@/state/wizard-store";
import { haptic } from "@/services/native-service";

interface ConsumptionStepProps {
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
}

const MIN_ANNUAL_KWH = 100;
const MAX_ANNUAL_KWH = 200000;

export function ConsumptionStep({ totalSteps, onBack, onNext }: ConsumptionStepProps) {
  const { t, i18n } = useTranslation();
  const { locale } = useAppLocale();
  const storedAnnual = useWizardStore((s) => s.annualConsumptionKwh);
  const storedMonthly = useWizardStore((s) => s.monthlyConsumptionKwh);
  const setConsumption = useWizardStore((s) => s.setConsumption);
  const storedShape = useWizardStore((s) => s.consumptionShape);
  const storedInputType = useWizardStore((s) => s.consumptionInputType);
  const location = useWizardStore((s) => s.location);
  const market = getMarketConfig(location?.countryCode);

  const monthLabels = i18n.t("months.long", { returnObjects: true }) as string[];
  const shortMonths = i18n.t("months.short", { returnObjects: true }) as string[];

  const [annual, setAnnual] = useState<string>(storedAnnual ? String(storedAnnual) : "");
  const [useMonthly, setUseMonthly] = useState(Boolean(storedMonthly));
  const [monthly, setMonthly] = useState<string[]>(
    storedMonthly
      ? storedMonthly.map((value) => String(Math.round(value)))
      : Array.from({ length: 12 }, () => ""),
  );

  const [shape, setShape] = useState<ConsumptionShape>(storedShape ?? "default");
  const [imported, setImported] = useState(storedInputType === "imported");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<"monthly" | "annual" | "error" | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    setParseStatus(null);
    setFileName(file.name);
    try {
      const { readConsumptionFile } = await import("@/lib/read-consumption-file");
      const parsed = await readConsumptionFile(file, i18n.language);
      if (parsed.monthly) {
        setMonthly(parsed.monthly.map((value) => String(Math.round(value))));
        setUseMonthly(true);
        setImported(true);
        setAnnual(String(parsed.annual ?? Math.round(sumMonthly(parsed.monthly))));
        setParseStatus("monthly");
        void haptic("medium");
      } else if (parsed.annual) {
        setUseMonthly(false);
        setImported(false);
        setAnnual(String(Math.round(parsed.annual)));
        setParseStatus("annual");
        void haptic("light");
      } else {
        setParseStatus("error");
      }
    } catch {
      setParseStatus("error");
    } finally {
      setParsing(false);
    }
  };

  const monthlyNumbers = monthly.map((value) => parseLocaleNumber(value, locale) ?? 0);
  const monthlyTotal = sumMonthly(monthlyNumbers);
  const effectiveAnnual = useMonthly ? monthlyTotal : (parseLocaleNumber(annual, locale) ?? 0);
  /**
   * Sanity check on the monthly split, expressed as each month's share of the
   * yearly total instead of an absolute kWh limit — a legitimately
   * high-consumption property is never blocked, only an impossible shape is.
   */
  const maxMonthShare =
    useMonthly && monthlyTotal > 0 ? Math.max(...monthlyNumbers) / monthlyTotal : 0;
  const monthShapeImplausible = maxMonthShare > 0.75;
  const monthShapeUneven = !monthShapeImplausible && maxMonthShare > 0.45;
  const valid =
    effectiveAnnual >= MIN_ANNUAL_KWH && effectiveAnnual <= MAX_ANNUAL_KWH && !monthShapeImplausible;
  const showEstimatedProfile = !useMonthly && valid;
  /**
   * Explain *why* the user cannot continue instead of only disabling the
   * button. Stays hidden until something has actually been entered.
   */
  const touched = useMonthly ? monthly.some((value) => value !== "") : annual !== "";
  const validationKey = !touched
    ? null
    : monthShapeImplausible
      ? "consumption.validation.monthOutOfRange"
      : valid
        ? monthShapeUneven
          ? "consumption.validation.monthUneven"
          : null
        : effectiveAnnual <= 0
          ? "consumption.validation.required"
          : effectiveAnnual < MIN_ANNUAL_KWH
            ? "consumption.validation.tooLow"
            : "consumption.validation.tooHigh";

  const estimatedMonthly = showEstimatedProfile
    ? estimateMonthlyConsumption(
        effectiveAnnual,
        shape,
        market.defaultConsumptionWeights,
        location?.latitude ?? null,
      )
    : null;

  return (
    <StepShell
      step={3}
      totalSteps={totalSteps}
      title={t("consumption.title")}
      subtitle={t("consumption.subtitle")}
      onBack={onBack}
      footer={
        <Button
className="h-auto w-full rounded-[24px] py-4 text-base font-bold shadow-cta"
          variant="cta"
          size="lg"
          disabled={!valid}
          onClick={() => {
            void haptic("medium");
            if (useMonthly) {
              setConsumption(
                effectiveAnnual,
                monthlyNumbers,
                imported ? "imported" : "monthly-manual",
                null,
              );
            } else {
              // Store whole kWh per month — the estimate is a rough split of
              // the annual figure, so keep it integer and avoid decimal noise.
              const roundedEstimated = estimatedMonthly?.map((value) => Math.round(value)) ?? null;
              setConsumption(
                effectiveAnnual,
                roundedEstimated,
                roundedEstimated ? "annual-profile" : "annual-only",
                roundedEstimated ? shape : null,
              );
            }
            onNext();
          }}
        >
          {t("common.next")}
          <ArrowRight className="size-4 text-accent" />
        </Button>
      }
    >
      {/* ── Upload card ── separate from manual entry ── */}
      <div className="glass-primary space-y-3 rounded-[28px] px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-accent">
            <FileUp className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              {t("consumption.upload.sectionTitle")}
            </p>
            <p className="text-xs leading-snug text-white/70">
              {t("consumption.upload.sectionHint")}
            </p>
          </div>
        </div>


        {parsing ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-white/25 bg-white/15 p-3">
            <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
            <p className="min-w-0 truncate text-xs font-medium text-white">
              {t("consumption.upload.readingFile", { name: fileName ?? "" })}
            </p>
          </div>
        ) : parseStatus === "monthly" || parseStatus === "annual" ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-accent/40 bg-white/15 p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/15 text-accent">
              <CheckCircle2 className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{fileName}</p>
              <p className="text-[11px] leading-tight text-white/70">
                {t(
                  parseStatus === "monthly"
                    ? "consumption.upload.successMonthly"
                    : "consumption.upload.successAnnual",
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => {
                setFileName(null);
                setParseStatus(null);
                setImported(false);
              }}
            >
              <X className="size-3.5" />
              <span className="sr-only">{t("consumption.upload.remove")}</span>
            </Button>
          </div>
        ) : parseStatus === "error" ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-red-400/50 bg-red-500/15 p-3">
            <p className="text-[11px] text-red-100">{t("consumption.upload.error")}</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 border-red-300/40 bg-white/10 px-2.5 text-xs text-red-50 hover:bg-white/20 hover:text-white"
              onClick={() => fileInputRef.current?.click()}
            >
              {t("consumption.upload.retry")}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-white/35 bg-white/10 px-4 py-5 text-center transition-colors hover:bg-white/20"
          >
            <FileUp className="size-5 text-accent" />
            <span className="text-sm font-semibold text-white">
              {t("consumption.upload.button")}
            </span>
            <span className="text-[11px] leading-tight text-white/60">
              {t("consumption.upload.fileTypes")}
            </span>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.csv,.txt,application/pdf,image/*,.png,.jpg,.jpeg,.webp,.heic"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </div>

      {/* ── Divider ── */}
      <div className="flex items-center gap-3 py-0.5">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {t("consumption.or")}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* ── Manual entry card ── */}
      <div className="glass-primary space-y-3 rounded-[28px] px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-white">{t("consumption.manual.sectionTitle")}</p>
          <p className="text-xs leading-snug text-white/70">{t("consumption.manual.sectionHint")}</p>
        </div>

        {!useMonthly ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="annual"
                type="text"
                inputMode="decimal"
                value={annual}
                placeholder={t("consumption.annualPlaceholder")}
                onChange={(event) => setAnnual(sanitizeNumericInput(event.target.value))}
                className="h-9 rounded-full border-white/25 bg-white/15 text-sm text-white placeholder:text-white/50"
              />
            </div>
            <span className="pb-2 text-[11px] text-white/70">{t("units.kwhPerYear")}</span>
          </div>
        ) : null}

        {validationKey ? (
          <p
            role="alert"
            className={monthShapeUneven ? "text-xs text-amber-200" : "text-xs text-red-200"}
          >
            {t(validationKey, { min: MIN_ANNUAL_KWH, max: MAX_ANNUAL_KWH })}
          </p>
        ) : null}


        <div className="flex items-center justify-between gap-4 border-t border-white/15 pt-3">
          <div className="flex items-center gap-2">
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                useMonthly
                  ? "bg-[var(--brand-black)] text-accent"
                  : "bg-white/15 text-white/50"
              }`}
            >
              {useMonthly ? <CheckCircle2 className="size-3.5" /> : <Minus className="size-3.5" />}
            </span>
            <Label htmlFor="monthly-toggle" className="text-xs leading-snug text-white/85">
              {t("consumption.useMonthly")}
            </Label>
          </div>
          <Switch
            id="monthly-toggle"
            checked={useMonthly}
            onCheckedChange={(checked) => {
              void haptic("light");
              setUseMonthly(checked);
            }}
            className="data-[state=checked]:bg-[var(--brand-black)] data-[state=unchecked]:bg-black/30"
          />
        </div>

        {useMonthly ? (
          <div className="space-y-2.5 border-t border-white/15 pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-white">{t("consumption.monthlyTitle")}</p>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                {shortMonths[0]}–{shortMonths[11]}
              </span>
            </div>
            <p className="text-[11px] leading-snug text-white/60">{t("consumption.monthlyHint")}</p>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {monthly.map((value, index) => (
                <div key={monthLabels[index]}>
                  <Label className="text-[10px] text-white/60">
                    {monthLabels[index]}
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => {
                      const next = [...monthly];
                      next[index] = sanitizeNumericInput(event.target.value);
                      setMonthly(next);
                    }}
                    className="mt-0.5 h-8 rounded-lg border-white/25 bg-white/15 px-1.5 text-[13px] text-white placeholder:text-white/50"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-baseline justify-between rounded-xl bg-white/10 px-3 py-2">
              <p className="text-xs text-white/60">{t("consumption.total")}</p>
              <p className="text-base font-bold text-white">
                {formatNumber(monthlyTotal, locale)}{" "}
                <span className="text-[11px] font-normal text-white/60">{t("units.kwhPerYear")}</span>
              </p>
            </div>
          </div>
        ) : null}

        {((useMonthly && monthlyTotal > 0) || (!useMonthly && annual !== "")) && !valid ? (
          <p className="text-xs text-red-200">{t("consumption.invalid")}</p>
        ) : null}
      </div>

      {showEstimatedProfile && estimatedMonthly ? (
        <div className="glass-primary space-y-2.5 rounded-[28px] px-4 py-4">
          <div>
            <p className="text-xs font-medium text-white">{t("consumption.shape.question")}</p>
            <p className="text-xs text-white/70">{t("consumption.shape.help")}</p>
          </div>

          <ConsumptionShapePicker
            value={shape}
            onChange={(next) => {
              void haptic("light");
              setShape(next);
            }}
            marketDefaultWeights={market.defaultConsumptionWeights}
            latitude={location?.latitude ?? null}
            onDark
          />

          <div className="border-t border-white/15 pt-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-white">{t("consumption.shape.previewTitle")}</p>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                {t("consumption.shape.estimatedBadge")}
              </span>
            </div>
            <MonthlyChart
              values={estimatedMonthly}
              labels={shortMonths}
              locale={locale}
              onDark
            />
            <p className="mt-2 text-[11px] leading-snug text-white/60">
              {shape === "default"
                ? t("consumption.shape.defaultNote")
                : t("consumption.shape.estimatedNote")}
            </p>
          </div>
        </div>
      ) : null}
    </StepShell>
  );
}