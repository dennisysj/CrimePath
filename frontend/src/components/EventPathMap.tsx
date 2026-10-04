import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { eventsWithLocations } from "../utils/googleMaps";

export type LocationEvent = {
  id: number;
  name: string;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  source: string;
};

export function formatCapturedAt(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function EventPopupContent({ event, order }: { event: LocationEvent; order: number }) {
  return (
    <div style={{ color: "#171717", fontSize: "13px", lineHeight: 1.45 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>
        {order}. {event.name}
      </p>
      <p style={{ margin: "6px 0 0" }}>Time: {formatCapturedAt(event.capturedAt)}</p>
      <p style={{ margin: "2px 0 0" }}>Timestamp: {event.capturedAt || "—"}</p>
      <p style={{ margin: "2px 0 0" }}>Latitude: {event.latitude ?? "—"}</p>
      <p style={{ margin: "2px 0 0" }}>Longitude: {event.longitude ?? "—"}</p>
      <p style={{ margin: "2px 0 0" }}>Source: {event.source || "—"}</p>
    </div>
  );
}

function sequenceIcon(order: number) {
  return L.divIcon({
    className: "event-sequence-marker",
    html: `<span style="display:flex;height:28px;width:28px;align-items:center;justify-content:center;border-radius:9999px;border:2px solid #0284c7;background:#0f172a;color:#fff;font:700 13px ui-sans-serif,system-ui,sans-serif;">${order}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function FitEventBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const key = positions.map(([latitude, longitude]) => `${latitude},${longitude}`).join("|");

  useEffect(() => {
    const points = key
      .split("|")
      .filter(Boolean)
      .map((pair) => pair.split(",").map(Number) as [number, number]);
    if (points.length === 0) return;

    const apply = () => {
      map.invalidateSize();
      if (points.length === 1) {
        map.setView(points[0], 16);
        return;
      }
      map.fitBounds(points, { padding: [56, 56], maxZoom: 15 });
    };

    apply();
    const timer = window.setTimeout(apply, 200);
    return () => window.clearTimeout(timer);
  }, [map, key]);

  return null;
}

type EventPathMapProps = {
  events: LocationEvent[];
};

export function EventPathMap({ events }: EventPathMapProps) {
  const [mounted, setMounted] = useState(false);
  const located = useMemo(() => eventsWithLocations(events), [events]);
  const positions = useMemo(
    () => located.map((event) => [event.latitude, event.longitude] as [number, number]),
    [located],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (located.length === 0) {
    return <p className="text-sm text-neutral-400">No GPS locations available</p>;
  }

  if (!mounted) {
    return <div className="h-[420px] w-full rounded-lg bg-neutral-900" aria-hidden />;
  }

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-lg border border-neutral-800">
      <MapContainer
        center={positions[0]}
        zoom={13}
        scrollWheelZoom
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
      >
        <FitEventBounds positions={positions} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {positions.length > 1 && (
          <Polyline
            positions={positions}
            pathOptions={{ color: "#0284c7", weight: 4, opacity: 0.9, dashArray: "10 8" }}
          />
        )}
        {located.map((event, index) => (
          <Marker
            key={event.id}
            position={[event.latitude, event.longitude]}
            icon={sequenceIcon(index + 1)}
            zIndexOffset={(index + 1) * 10}
          >
            <Tooltip
              permanent
              direction="top"
              offset={[0, -12]}
              className="event-sequence-tooltip"
            >
              {index + 1}. {event.name}
            </Tooltip>
            <Popup className="event-popup">
              <EventPopupContent event={event} order={index + 1} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
