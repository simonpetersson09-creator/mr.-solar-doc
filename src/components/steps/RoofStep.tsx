import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Loader2, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StepShell } from "@/components/StepShell";
import { CompassDial } from "@/components/CompassDial";
import { useSolarResource } from "@/hooks/use-solar-resource";
import { useAppLocale } from "@/hooks/use-app-locale";
import { formatNumber } from "@/lib/format";
import { useWizardStore } from "@/state/wizard-store";
import { haptic } from "@/services/native-service";
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

  useEffect(() => {
    setResource(query.data ?? null);
  }, [query.data, setResource]);

  const assumed = orientation === "unknown" || tiltDegrees === null;

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
        <div className="card-elevated px-4 py-5">
          <div className="mb-1 text-center">
            <Label className="text-xs">{t("roof.orientation")}</Label>
            <p className="text-[11px] text-muted-foreground">{t("roof.manualHint")}</p>
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
        <div className="card-elevated px-4 py-4">
          <div className="mb-2">
            <Label className="text-xs">{t("roof.tilt")}</Label>
            <p className="text-[11px] text-muted-foreground">{t("roof.tiltHint")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
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
                    ? "rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-sm"
                    : "rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/40 hover:bg-secondary"
                }
              >
                {preset}°
              </button>
            ))}
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={90}
              value={tiltDegrees ?? ""}
              placeholder={t("roof.tiltDegrees")}
              onChange={(event) => {
                const value = event.target.value;
                setRoof(orientation, value === "" ? null : Number(value), azimuthDegrees);
              }}
              className="h-7 w-16 px-2 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                void haptic("light");
                setRoof(orientation, null, azimuthDegrees);
              }}
              className={
                tiltDegrees === null
                  ? "rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-sm"
                  : "rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/40 hover:bg-secondary"
              }
            >
              {t("common.dontKnow")}
            </button>
          </div>
        </div>
      </div>

      {assumed ? (
        <div className="flex gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-accent" />
          <p>{t("roof.assumptionNotice")}</p>
        </div>
      ) : null}

      {query.isPending ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("roof.fetching")}
        </div>
      ) : null}

      {query.isError ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5">
          <p className="text-xs text-destructive">{t("roof.error")}</p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : null}

      {query.data ? (
        <div className="hero-metric flex items-center justify-between gap-4 rounded-2xl px-4 py-3">
          <div className="glow-amber -top-10 -right-10 size-32" aria-hidden="true" />
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              <Sun className="size-3.5" />
              {t("roof.result")}
            </div>
            <p className="mt-0.5 text-[11px] text-white/70">{query.data.dataSource}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl leading-none font-extrabold tracking-tight">
              {formatNumber(query.data.annualKwhPerKwp, locale)}
            </p>
            <p className="mt-1 text-[11px] text-white/70">{t("roof.unit")}</p>
          </div>
        </div>
      ) : null}
    </StepShell>
  );
}
