import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, FileUp, Loader2, X } from "lucide-react";
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
    storedMonthly ? storedMonthly.map(String) : Array.from({ length: 12 }, () => ""),
  );

  const [shape, setShape] = useState<ConsumptionShape>(storedShape ?? "default");
  const [imported, setImported] = useState(storedInputType === "imported");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<"monthly" | "annual" | "error" | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    setParsing(true);
    setParseStatus(null);
    setFileName(file.name);
    try {
      const { readConsumptionFile } = await import("@/lib/read-consumption-file");
      const parsed = await readConsumptionFile(file);
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

  const monthlyNumbers = monthly.map((value) => parseLocaleNumber(value) ?? 0);
  const monthlyTotal = sumMonthly(monthlyNumbers);
  const effectiveAnnual = useMonthly ? monthlyTotal : (parseLocaleNumber(annual) ?? 0);
  const valid = effectiveAnnual >= MIN_ANNUAL_KWH && effectiveAnnual <= MAX_ANNUAL_KWH;
  const showEstimatedProfile = !useMonthly && valid;
  /**
   * Explain *why* the user cannot continue instead of only disabling the
   * button. Stays hidden until something has actually been entered.
   */
  const touched = useMonthly ? monthly.some((value) => value !== "") : annual !== "";
  const validationKey = !touched || valid
    ? null
    : effectiveAnnual <= 0
      ? "consumption.validation.required"
      : effectiveAnnual < MIN_ANNUAL_KWH
        ? "consumption.validation.tooLow"
        : "consumption.validation.tooHigh";
  const estimatedMonthly = showEstimatedProfile
    ? estimateMonthlyConsumption(effectiveAnnual, shape, market.defaultConsumptionWeights)
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
          className="w-full"
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
              setConsumption(
                effectiveAnnual,
                estimatedMonthly,
                estimatedMonthly ? "annual-profile" : "annual-only",
                estimatedMonthly ? shape : null,
              );
            }
            onNext();
          }}
        >
          {t("common.next")}
        </Button>
      }
    >
      <div className="card-elevated space-y-2.5 p-3">
        {parsing ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/40 p-3">
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
            <p className="min-w-0 truncate text-xs font-medium">
              {t("consumption.upload.readingFile", { name: fileName ?? "" })}
            </p>
          </div>
        ) : parseStatus === "monthly" || parseStatus === "annual" ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{fileName}</p>
              <p className="text-[11px] leading-tight text-primary">
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
              className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
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
          <div className="flex items-center justify-between gap-2 rounded-xl border border-destructive/50 bg-destructive/5 p-3">
            <p className="text-[11px] text-destructive">{t("consumption.upload.error")}</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2.5 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              {t("consumption.upload.retry")}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp className="size-4 text-primary" />
            {t("consumption.upload.title")}
          </Button>
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
        {parseStatus === "error" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-destructive">{t("consumption.upload.error")}</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2.5 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              {t("consumption.upload.retry")}
            </Button>
          </div>
        ) : null}


        <div className="border-t border-border" />

        {!useMonthly ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="annual" className="text-xs text-muted-foreground">
                {t("consumption.annual")}
              </Label>
              <Input
                id="annual"
                type="text"
                inputMode="decimal"
                value={annual}
                placeholder={t("consumption.annualPlaceholder")}
                onChange={(event) => setAnnual(event.target.value)}
                className="mt-0.5 h-9 text-sm"
              />
            </div>
            <span className="pb-2 text-[11px] text-muted-foreground">{t("units.kwhPerYear")}</span>
          </div>
        ) : null}

        {validationKey ? (
          <p role="alert" className="text-xs text-destructive">
            {t(validationKey, { min: MIN_ANNUAL_KWH, max: MAX_ANNUAL_KWH })}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t border-border pt-2.5 first:border-0 first:pt-0">
          <Label htmlFor="monthly-toggle" className="text-xs leading-snug">
            {t("consumption.useMonthly")}
          </Label>
          <Switch
            id="monthly-toggle"
            checked={useMonthly}
            onCheckedChange={(checked) => {
              void haptic("light");
              setUseMonthly(checked);
            }}
          />
        </div>

        {useMonthly ? (
          <div className="space-y-2.5 border-t border-border pt-2.5">
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {monthly.map((value, index) => (
                <div key={monthLabels[index]}>
                  <Label className="text-[10px] text-muted-foreground">
                    {monthLabels[index]}
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => {
                      const next = [...monthly];
                      next[index] = event.target.value;
                      setMonthly(next);
                    }}
                    className="mt-0.5 h-8 px-1.5 text-[13px]"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-baseline justify-between rounded-lg bg-secondary px-3 py-1.5">
              <p className="text-xs text-muted-foreground">{t("consumption.total")}</p>
              <p className="text-base font-bold">
                {formatNumber(monthlyTotal, locale)}{" "}
                <span className="text-[11px] font-normal">{t("units.kwhPerYear")}</span>
              </p>
            </div>
          </div>
        ) : null}

        {((useMonthly && monthlyTotal > 0) || (!useMonthly && annual !== "")) && !valid ? (
          <p className="text-xs text-destructive">{t("consumption.invalid")}</p>
        ) : null}
      </div>

      {showEstimatedProfile && estimatedMonthly ? (
        <div className="card-elevated space-y-2 p-3">
          <div>
            <p className="text-xs font-medium">{t("consumption.shape.question")}</p>
            <p className="text-xs text-muted-foreground">{t("consumption.shape.help")}</p>
          </div>

          <ConsumptionShapePicker
            value={shape}
            onChange={(next) => {
              void haptic("light");
              setShape(next);
            }}
            marketDefaultWeights={market.defaultConsumptionWeights}
          />

          <div className="border-t border-border pt-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs font-medium">{t("consumption.shape.previewTitle")}</p>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("consumption.shape.estimatedBadge")}
              </span>
            </div>
            <MonthlyChart
              values={estimatedMonthly}
              labels={shortMonths}
              locale={locale}
            />
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
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
