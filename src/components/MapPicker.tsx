import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapPickerProps {
  latitude: number;
  longitude: number;
  zoom?: number;
  showMarker: boolean;
  onPositionChange: (latitude: number, longitude: number) => void;
}

const markerIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:9999px;background:oklch(0.78 0.16 72);border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,.3)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export default function MapPicker({
  latitude,
  longitude,
  zoom = 18,
  showMarker,
  onPositionChange,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const changeRef = useRef(onPositionChange);
  changeRef.current = onPositionChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { attributionControl: true }).setView(
      [latitude, longitude],
      zoom,
    );
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

  return <div ref={containerRef} className="h-64 w-full overflow-hidden rounded-xl" />;
}
