import { useTranslation } from "react-i18next";
import { ArrowRight, Loader2, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumericField } from "@/components/NumericField";
import { Label } from "@/components/ui/label";
import { StepShell } from "@/components/StepShell";
import { CompassDial } from "@/components/CompassDial";
import { TiltDial } from "@/components/TiltDial";
import { useSolarResource } from "@/hooks/use-solar-resource";
import { useAppLocale } from "@/hooks/use-app-locale";
import { formatNumber } from "@/lib/format";
import { useWizardStore } from "@/state/wizard-store";
import { haptic } from "@/services/native-service";
import { describePvgisError } from "@/lib/pvgis-error";
import type { Orientation } from "@/lib/calc/types";
import { useEffect } from "react";

const TILT_PRESETS = [15, 27, 30, 45];

/** Compass azimuth (0=N, clockwise) for each preset orientation. */
const ORIENTATION_COMPASS: Record<Exclude<Orientation, "unknown">, number> = {
  south: 180,
  southeast: 135,
  southwest: 225,
  east: 90,
  west: 270,
};

/** Nearest preset orientation for a given compass azimuth. */
function nearestOrientation(compass: number): Exclude<Orientation, "unknown"> {
  let best: Exclude<Orientation, "unknown"> = "south";
  let bestDiff = Infinity;
  for (const [orientation, deg] of Object.entries(ORIENTATION_COMPASS) as [
    Exclude<Orientation, "unknown">,
    number,
  ][]) {
    const diff = Math.min(Math.abs(compass - deg), 360 - Math.abs(compass - deg));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = orientation;
    }
  }
  return best;
}

interface RoofStepProps {
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
}

export function RoofStep({ totalSteps, onBack, onNext }: RoofStepProps) {
  const { t } = useTranslation();
  const { locale } = useAppLocale();
  const location = useWizardStore((s) => s.location);
  const orientation = useWizardStore((s) => s.orientation);
  const tiltDegrees = useWizardStore((s) => s.tiltDegrees);
  const azimuthDegrees = useWizardStore((s) => s.azimuthDegrees);
  const setRoof = useWizardStore((s) => s.setRoof);
  const setResource = useWizardStore((s) => s.setResource);

  const dialValue =
    azimuthDegrees ??
    (orientation !== "unknown" ? ORIENTATION_COMPASS[orientation] : 180);

  const query = useSolarResource({
    latitude: location?.latitude,
    longitude: location?.longitude,
    orientation,
    tiltDegrees,
    azimuthDegrees,
  });

  const pvgisError = describePvgisError(query.error);

  useEffect(() => {
    setResource(query.data ?? null);
  }, [query.data, setResource]);

  

const handleDialChange = (degrees: number) => {
    setRoof(nearestOrientation(degrees), tiltDegrees, degrees);
  };

  return (
    <StepShell
      step={2}
      totalSteps={totalSteps}
title={t("roof.title")}
      onBack={onBack}
footer={
        <Button
className="h-auto w-full rounded-[24px] py-4 text-base font-bold shadow-cta"
          variant="cta"
          size="lg"
          disabled={!query.data}
          onClick={() => {
            void haptic("medium");
            onNext();
          }}
        >
          {t("common.next")}
          <ArrowRight className="size-4 text-accent" />
        </Button>
      }
    >
      <div className="space-y-5">
{/* Compass — one card */}
        <div className="glass-primary rounded-[28px] px-4 py-5">
          <div className="mb-1 text-center">
            <Label className="text-xs text-white">{t("roof.orientation")}</Label>
            <p className="text-[11px] text-white/70">{t("roof.manualHint")}</p>
          </div>
          <div className="flex justify-center">
            <CompassDial
              value={dialValue}
              onChange={handleDialChange}
              size="sm"
              caption={t(`roof.orientations.${nearestOrientation(dialValue)}`)}
            />
          </div>
        </div>

{/* Tilt — one card */}
        <div className="glass-primary rounded-[28px] px-4 py-4">
<div className="mb-2 text-center">
            <Label className="text-xs text-white">{t("roof.tilt")}</Label>
          </div>
          {/* Drag the roof line to set the tilt; presets stay as shortcuts. */}
          <div className="mb-3 flex justify-center">
            <TiltDial
              value={tiltDegrees ?? 30}
              onChange={(degrees) => setRoof(orientation, degrees, azimuthDegrees)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {TILT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  void haptic("light");
                  setRoof(orientation, preset, azimuthDegrees);
                }}
                className={
                  tiltDegrees === preset
                    ? "rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-foreground shadow-md shadow-accent/30"
                    : "rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-white/25"
                }
              >
                {preset}°
              </button>
            ))}
            {/* Locale-safe: the user may type "30", "30,5" or "30.5". */}
            <NumericField
              locale={locale}
              value={tiltDegrees}
              min={0}
              max={90}
              decimals={1}
              placeholder={t("roof.tiltDegrees")}
              onCommit={(value) => setRoof(orientation, value, azimuthDegrees)}
              className="h-7 w-16 rounded-full border-white/25 bg-white/15 px-2 text-xs text-white placeholder:text-white/50"
            />
          </div>
        </div>
      </div>


      {/* Fixed result card: only the number swaps while a new value loads. */}
      <div className="glass-primary relative overflow-hidden rounded-[28px] px-4 py-3">
        <div className="glow-amber -top-10 -right-10 size-32" aria-hidden="true" />
        <div className="flex items-center justify-between gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-accent">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              <Sun className="size-3.5 text-accent" />
              {t("roof.result")}
            </div>
            <p className="mt-0.5 min-h-4 text-[11px] text-white/70">
              {query.data?.dataSource ?? ""}
            </p>
          </div>
          <div className="flex min-h-[44px] flex-col items-center justify-center text-center">
            {query.isError && !query.data ? (
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t("common.retry")}
              </Button>
            ) : query.data ? (
              <>
                <p
                  className={`text-3xl leading-none font-extrabold tracking-tight text-accent transition-opacity ${
                    query.isFetching ? "opacity-40" : "opacity-100"
                  }`}
                >
                  {formatNumber(query.data.annualKwhPerKwp, locale)}
                </p>
                <p className="mt-1 text-[11px] text-white/70">{t("roof.unit")}</p>
              </>
            ) : (
              <Loader2 className="size-6 animate-spin text-white/70" />
            )}
          </div>
        </div>
        <p className="mt-2.5 border-t border-white/15 pt-2 text-center text-[10px] leading-relaxed text-white/60">
          {query.isError
            ? pvgisError.kind === "over-sea"
              ? t("roof.errorOverSea")
              : pvgisError.kind === "outside-coverage"
                ? t("roof.errorOutsideCoverage")
                : t("roof.error")
            : t("roof.disclaimer")}
        </p>
      </div>
    </StepShell>
  );
}
