import { useEffect, useState, type ReactNode } from "react";
import { MapContainer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { isValidCoordinate } from "../utils/googleMaps";
import { BaseTiles, type MapVariant } from "./mapTiles";

const markerIcon = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export type MapPreviewProps = {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  zoom?: number;
  popup?: ReactNode;
  /** Tailwind height class for the map box. */
  heightClass?: string;
  variant?: MapVariant;
  scrollWheelZoom?: boolean;
};

function SyncMapView({
  latitude,
  longitude,
  zoom,
}: {
  latitude: number;
  longitude: number;
  zoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    map.setView([latitude, longitude], zoom);
    map.invalidateSize();
  }, [map, latitude, longitude, zoom]);

  return null;
}

export function MapPreview({
  latitude,
  longitude,
  zoom = 16,
  popup,
  heightClass = "h-[420px]",
  variant = "light",
  scrollWheelZoom = true,
}: MapPreviewProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (latitude == null || longitude == null || !isValidCoordinate(latitude, longitude)) {
    return <p className="text-sm text-neutral-400">No GPS locations available</p>;
  }

  if (!mounted) {
    return <div className={`${heightClass} w-full rounded-lg bg-neutral-900`} aria-hidden />;
  }

  return (
    <div className={`${heightClass} isolate w-full overflow-hidden rounded-lg border border-neutral-800`}>
      <MapContainer
        key={`${latitude},${longitude},${zoom}`}
        center={[latitude, longitude]}
        zoom={zoom}
        scrollWheelZoom={scrollWheelZoom}
        className={`h-full w-full ${variant === "dark" ? "map-dark" : ""}`}
        style={{ height: "100%", width: "100%" }}
      >
        <SyncMapView latitude={latitude} longitude={longitude} zoom={zoom} />
        <BaseTiles />
        <Marker position={[latitude, longitude]} icon={markerIcon}>
          {popup ? <Popup className="event-popup">{popup}</Popup> : null}
        </Marker>
      </MapContainer>
    </div>
  );
}
