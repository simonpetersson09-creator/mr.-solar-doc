import { Suspense, lazy, useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Loader2, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StepShell } from "@/components/StepShell";
import { useAddressSearch } from "@/hooks/use-address-search";
import { useAppLocale } from "@/hooks/use-app-locale";
import { resolvePosition } from "@/services/geocoding-service";
import { useWizardStore } from "@/state/wizard-store";
import { haptic } from "@/services/native-service";

const MapPicker = lazy(() => import("@/components/MapPicker"));

interface AddressStepProps {
  totalSteps: number;
  onNext: () => void;
}

export function AddressStep({ totalSteps, onNext }: AddressStepProps) {
  const { t } = useTranslation();
  const { language } = useAppLocale();
  const location = useWizardStore((s) => s.location);
  const setLocation = useWizardStore((s) => s.setLocation);

  const [query, setQuery] = useState(location?.address ?? "");
  const [debounced, setDebounced] = useState(query);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: suggestions, isFetching, isError } = useAddressSearch(debounced, language);

  const handlePositionChange = async (latitude: number, longitude: number) => {
    const resolved = await resolvePosition(latitude, longitude, language).catch(() => null);
    const address = resolved?.label ?? location?.address ?? "";
    setLocation({
      address,
      latitude,
      longitude,
      countryCode: resolved?.countryCode ?? location?.countryCode ?? "",
      region: resolved?.region ?? location?.region ?? "",
    });
    if (resolved?.label) {
      setQuery(resolved.label);
      setShowResults(false);
    }
  };

  // Default view: Sweden overview until a position is chosen.
  const mapLatitude = location?.latitude ?? 59.33;
  const mapLongitude = location?.longitude ?? 18.07;
  const mapZoom = location ? 17 : 4;

  return (
    <StepShell
      step={1}
      totalSteps={totalSteps}
      title={t("address.title")}
      subtitle={t("address.subtitle")}
      footer={
        <Button
          className="w-full"
          size="lg"
          disabled={!location}
          onClick={() => {
            void haptic("medium");
            onNext();
          }}
        >
          {t("common.next")}
        </Button>
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShowResults(true);
          }}
          placeholder={t("address.placeholder")}
          className="h-12 pl-9"
          autoComplete="off"
        />
        {isFetching ? (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {isError ? <p className="text-sm text-destructive">{t("address.error")}</p> : null}

      {showResults && suggestions && suggestions.length > 0 ? (
        <ul className="card-elevated divide-y divide-border overflow-hidden">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary"
                onClick={() => {
                  void haptic("light");
                  setLocation({
                    address: suggestion.label,
                    latitude: suggestion.latitude,
                    longitude: suggestion.longitude,
                    countryCode: suggestion.countryCode,
                    region: suggestion.region,
                  });
                  setQuery(suggestion.label);
                  setShowResults(false);
                }}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                <span className="text-sm">{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showResults && !isFetching && debounced.length >= 3 && suggestions?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("address.noResults")}</p>
      ) : null}

      {location ? (
        <div className="card-elevated space-y-3 p-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("address.selected")}
            </p>
            <p className="mt-1 text-sm font-medium">{location.address}</p>
          </div>
          <ClientOnly fallback={<div className="h-64 w-full rounded-xl bg-muted" />}>
            <Suspense fallback={<div className="h-64 w-full rounded-xl bg-muted" />}>
              <MapPicker
                latitude={location.latitude}
                longitude={location.longitude}
                onPositionChange={(lat, lon) => void handlePositionChange(lat, lon)}
              />
            </Suspense>
          </ClientOnly>
          <p className="text-xs text-muted-foreground">{t("address.adjustHint")}</p>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">{t("address.coordinates")}</dt>
              <dd className="font-medium">
                {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("address.country")}</dt>
              <dd className="font-medium">
                {location.countryCode || "—"}
                {location.region ? ` · ${location.region}` : ""}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </StepShell>
  );
}
