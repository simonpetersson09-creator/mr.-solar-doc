import { Suspense, lazy, useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Loader2, MapPin, Minus, Plus, Search, Sun } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import type L from "leaflet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="surface-sun relative flex min-h-dvh flex-col">
      {/* Map hero — fixed height; the action buttons live below in the page scroll */}
      <div className="relative h-[60dvh] min-h-[440px] max-h-[540px] shrink-0">
        {/* Full-bleed map backdrop */}
        <div className="absolute inset-0 z-0 overflow-hidden">
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

        {/* Soft scrim so the frosted UI stays legible over map labels */}
        <div className="pointer-events-none absolute inset-0 z-[5] bg-foreground/15" />

        {/* Center reticle: hints where the marker lands until a location is picked */}
        {!location ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="relative flex flex-col items-center">
              <span className="absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-accent/25" />
              <MapPin
                fill="currentColor"
                strokeWidth={0}
                className="relative size-12 text-accent drop-shadow-lg"
              />
              <div className="mt-1 h-1 w-3 rounded-full bg-foreground/20 blur-[2px]" />
            </div>
          </div>
        ) : null}

        {/* Floating glass sheet: progress + search */}
        <div
          className="relative z-20 mx-auto w-full max-w-2xl px-5"
          style={{ paddingTop: "calc(0.25rem + env(safe-area-inset-top))" }}
        >
          <div className="glass-primary rounded-[28px] p-4">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-8 rotate-3 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-lg shadow-accent/40">
                  <Sun className="size-4" />
                </span>
                <div className="flex gap-1.5" aria-hidden>
                  {Array.from({ length: totalSteps }, (_, index) => (
                    <div
                      key={index}
                      className={
                        index === 0
                          ? "h-1.5 w-2.5 rounded-full bg-accent"
                          : "size-1.5 rounded-full bg-white/25"
                      }
                    />
                  ))}
                </div>
              </div>
              <LanguageSwitcher className="h-8 w-auto gap-2 rounded-full border-white/25 bg-white/15 px-3 text-xs font-bold text-white shadow-sm" />
            </div>

            <h1 className="mb-4 text-[22px] leading-[1.1] font-bold text-white">{t("address.title")}</h1>

            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4.5 -translate-y-1/2 text-accent" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShowResults(true);
                }}
                placeholder={t("address.placeholder")}
                className="h-12 rounded-[18px] border-white/40 bg-card pl-11 pr-10 text-[15px] font-medium text-foreground shadow-sm placeholder:text-muted-foreground focus:border-accent focus:ring-4 focus:ring-accent/30 focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/30"
                autoComplete="off"
              />
              {isFetching ? (
                <Loader2 className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : null}

              {showResults && suggestions && suggestions.length > 0 ? (
                <ul className="absolute inset-x-0 top-full z-30 mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
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
              <p className="mt-2 text-sm font-semibold text-accent">{t("address.error")}</p>
            ) : null}
            {showResults && !isFetching && debounced.length >= 3 && suggestions?.length === 0 ? (
              <p className="mt-2 text-sm text-white/70">{t("address.noResults")}</p>
            ) : null}
          </div>
        </div>

        {/* Custom zoom controls pinned to the map hero */}
        {map ? (
          <div className="absolute right-4 bottom-4 z-20 flex flex-col gap-2">
            <button
              type="button"
              aria-label="Zooma in"
              className="flex size-12 items-center justify-center rounded-2xl border border-primary/50 bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform active:scale-90"
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
              className="flex size-12 items-center justify-center rounded-2xl border border-primary/50 bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform active:scale-90"
              onClick={() => {
                void haptic("light");
                map.zoomOut();
              }}
            >
              <Minus className="size-5" />
            </button>
          </div>
        ) : null}
      </div>

      {/* In-flow content: note + CTA at the bottom of the page scroll */}
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {unsupportedMarket ? (
          <p className="mb-4 rounded-2xl border border-border bg-card/90 p-3 text-center text-xs text-foreground">
            {t("address.marketUnsupported")}
          </p>
        ) : null}

        <div className="mt-auto">
          <Button
            type="button"
            aria-label={t("common.next")}
            disabled={!location || unsupportedMarket}
            onClick={() => {
              void haptic("medium");
              onNext();
            }}
            className="h-auto w-full rounded-[24px] py-4 text-base font-bold shadow-cta"
            size="lg"
          >
            {t("common.next")}
            <ArrowRight className="size-4 text-accent" />
          </Button>
        </div>
      </div>
    </div>
  );
}