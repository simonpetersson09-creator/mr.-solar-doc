import { Suspense, lazy, useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Loader2, MapPin, Minus, Plus, Search, Sun } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import type L from "leaflet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAddressSearch } from "@/hooks/use-address-search";
import { useAppLocale } from "@/hooks/use-app-locale";
import { resolvePosition } from "@/services/geocoding-service";
import { useWizardStore } from "@/state/wizard-store";
import { isActiveMarket } from "@/config/markets";
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
  const [map, setMap] = useState<L.Map | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 500);
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

  // A resolved address outside the supported markets may not continue.
  const unsupportedMarket = Boolean(
    location?.countryCode && !isActiveMarket(location.countryCode),
  );

  // Default view: Sweden overview until a position is chosen.
  const mapLatitude = location?.latitude ?? 62.0;
  const mapLongitude = location?.longitude ?? 15.0;
  const mapZoom = location ? 17 : 4;

  return (
    {/* Fixed to the viewport height: the map backdrop may never stretch the
        page below the primary action, not even on very tall screens. */}
    <div className="surface-sun relative flex h-dvh max-h-dvh flex-col overflow-hidden">
      {/* Full-bleed map backdrop */}
      <div className="absolute inset-0 z-0">
        <ClientOnly fallback={<div className="h-full w-full bg-muted" />}>
          <Suspense fallback={<div className="h-full w-full bg-muted" />}>
            <MapPicker
              latitude={mapLatitude}
              longitude={mapLongitude}
              zoom={mapZoom}
              showMarker={!!location}
              className="h-full w-full"
              hideZoomControl
              onMapReady={setMap}
              onPositionChange={(lat, lon) => void handlePositionChange(lat, lon)}
            />
          </Suspense>
        </ClientOnly>
      </div>

      {/* Top overlay: step indicator + floating search card */}
      <div className="relative z-20 mx-auto w-full max-w-2xl space-y-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-md">
            <Sun className="size-5" />
          </span>
          <div className="flex flex-1 gap-1.5" aria-hidden>
            {Array.from({ length: totalSteps }, (_, index) => (
              <div
                key={index}
                className={
                  index === 0
                    ? "h-1.5 w-8 rounded-full bg-accent"
                    : "h-1.5 w-4 rounded-full bg-foreground/15"
                }
              />
            ))}
          </div>
          <LanguageSwitcher className="h-9 w-auto gap-2 border-border bg-card/90 px-2.5 text-xs shadow-md backdrop-blur" />
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/90 p-5 shadow-xl backdrop-blur-md">
          <h1 className="text-xl leading-tight font-bold tracking-tight text-foreground">
            {t("address.title")}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">{t("address.subtitle")}</p>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowResults(true);
              }}
              placeholder={t("address.placeholder")}
              className="h-12 rounded-xl pl-10"
              autoComplete="off"
            />
            {isFetching ? (
              <Loader2 className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}

            {showResults && suggestions && suggestions.length > 0 ? (
              <ul className="absolute inset-x-0 top-full z-30 mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xl">
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
          </div>

          {isError ? (
            <p className="mt-2 text-sm text-destructive">{t("address.error")}</p>
          ) : null}
          {showResults && !isFetching && debounced.length >= 3 && suggestions?.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("address.noResults")}</p>
          ) : null}

          {location ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2.5">
              <MapPin className="size-4 shrink-0 text-accent" />
              <p className="truncate text-sm font-medium">{location.address}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Custom zoom controls (Leaflet's own would hide behind the overlays) */}
      {map ? (
        <div className="absolute right-4 bottom-44 z-20 flex flex-col gap-2">
          <button
            type="button"
            aria-label="Zooma in"
            className="flex size-11 items-center justify-center rounded-full border border-border/60 bg-card/90 text-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-secondary active:scale-95"
            onClick={() => {
              void haptic("light");
              map.zoomIn();
            }}
          >
            <Plus className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Zooma ut"
            className="flex size-11 items-center justify-center rounded-full border border-border/60 bg-card/90 text-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-secondary active:scale-95"
            onClick={() => {
              void haptic("light");
              map.zoomOut();
            }}
          >
            <Minus className="size-5" />
          </button>
        </div>
      ) : null}

      {/* Bottom overlay: hint + action over fading gradient */}
      <div className="pointer-events-none relative z-20 mt-auto bg-gradient-to-t from-background via-background/80 to-transparent pt-16">
        <div className="pointer-events-auto mx-auto w-full max-w-2xl space-y-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <p className="text-center text-xs text-muted-foreground italic">
            {location ? t("address.adjustHint") : t("address.mapHint")}
          </p>
          {unsupportedMarket ? (
            <p className="rounded-xl border border-border bg-card/90 p-3 text-center text-xs text-foreground">
              {t("address.marketUnsupported")}
            </p>
          ) : null}
          <Button
            className="h-14 w-full rounded-2xl text-base font-bold"
            size="lg"
            disabled={!location || unsupportedMarket}
            onClick={() => {
              void haptic("medium");
              onNext();
            }}
          >
            {t("common.next")}
            <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
