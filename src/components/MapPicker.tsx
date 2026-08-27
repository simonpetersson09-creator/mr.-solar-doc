import { useEffect, useRef } from "react";
import L from "leaflet";

interface MapPickerProps {
  latitude: number;
  longitude: number;
  onPositionChange: (latitude: number, longitude: number) => void;
}

const markerIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:9999px;background:oklch(0.78 0.16 72);border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,.3)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export default function MapPicker({ latitude, longitude, onPositionChange }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const changeRef = useRef(onPositionChange);
  changeRef.current = onPositionChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { attributionControl: true }).setView(
      [latitude, longitude],
      18,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    const marker = L.marker([latitude, longitude], { draggable: true, icon: markerIcon }).addTo(map);
    marker.on("dragend", () => {
      const position = marker.getLatLng();
      changeRef.current(position.lat, position.lng);
    });
    map.on("click", (event: L.LeafletMouseEvent) => {
      marker.setLatLng(event.latlng);
      changeRef.current(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([latitude, longitude]);
    mapRef.current.setView([latitude, longitude], mapRef.current.getZoom());
  }, [latitude, longitude]);

  return <div ref={containerRef} className="h-64 w-full overflow-hidden rounded-xl" />;
}
