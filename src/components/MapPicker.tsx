import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapPickerProps {
  latitude: number;
  longitude: number;
  zoom?: number;
  showMarker: boolean;
  onPositionChange: (latitude: number, longitude: number) => void;
  /** Override container classes, e.g. fill a flex parent. */
  className?: string;
  /** Hide the default +/- zoom control (e.g. when rendered as a backdrop). */
  hideZoomControl?: boolean;
  /** Called once the Leaflet map instance is ready. */
  onMapReady?: (map: L.Map) => void;
  /** True while the user pans/zooms — lets parents drop expensive effects. */
  onInteractingChange?: (interacting: boolean) => void;
}

const markerIcon = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:22px;height:22px">
    <div style="position:absolute;inset:-14px;border-radius:9999px;background:oklch(0.78 0.16 72 / 0.35);animation:marker-ping 1.8s cubic-bezier(0,0,.2,1) infinite"></div>
    <div style="position:absolute;inset:0;border-radius:9999px;background:oklch(0.78 0.16 72);border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,.3)"></div>
  </div>
  <style>@keyframes marker-ping{0%{transform:scale(.6);opacity:1}75%,100%{transform:scale(1.6);opacity:0}}</style>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export default function MapPicker({
  latitude,
  longitude,
  zoom = 18,
  showMarker,
  onPositionChange,
  className = "h-64 w-full overflow-hidden rounded-xl",
  hideZoomControl = false,
  onMapReady,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const changeRef = useRef(onPositionChange);
  changeRef.current = onPositionChange;
  const readyRef = useRef(onMapReady);
  readyRef.current = onMapReady;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      attributionControl: true,
      zoomControl: !hideZoomControl,
    }).setView([latitude, longitude], zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      if (markerRef.current) {
        markerRef.current.setLatLng(event.latlng);
      } else {
        markerRef.current = L.marker(event.latlng, {
          draggable: true,
          icon: markerIcon,
        }).addTo(map);
        markerRef.current.on("dragend", () => {
          const position = markerRef.current!.getLatLng();
          changeRef.current(position.lat, position.lng);
        });
      }
      changeRef.current(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;
    readyRef.current?.(map);

    // Container is often sized after mount (lazy/Suspense); recalc so clicks map correctly.
    const invalidate = () => map.invalidateSize();
    const timer = setTimeout(invalidate, 0);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(invalidate) : null;
    observer?.observe(containerRef.current);

    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (showMarker) {
      if (!markerRef.current) {
        markerRef.current = L.marker([latitude, longitude], {
          draggable: true,
          icon: markerIcon,
        }).addTo(map);
        markerRef.current.on("dragend", () => {
          const position = markerRef.current!.getLatLng();
          changeRef.current(position.lat, position.lng);
        });
      } else {
        markerRef.current.setLatLng([latitude, longitude]);
      }
      map.setView([latitude, longitude], zoom);
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [latitude, longitude, zoom, showMarker]);

  return <div ref={containerRef} className={className} />;
}
