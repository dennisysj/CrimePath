import { useEffect, useState } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { Loader2, MapPin, Search } from "lucide-react";
import { BaseTiles } from "../../../../components/mapTiles";
import { geocodePlace } from "../../api";

const markerIcon = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});

/** Where the map opens when there's no pin yet (Metro Vancouver, where the case data is). */
const DEFAULT_CENTER: [number, number] = [49.25, -123.1];

interface LocationCoordinatesProps {
  locationName: string;
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
}

const inputClass =
  "w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 font-mono text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none";

function formatCoord(value: number | null): string {
  return value == null ? "" : String(Number(value.toFixed(6)));
}

/**
 * Coordinates for the evidence's location: typed in, looked up from the
 * location name ("Find"), or picked by clicking/dragging a pin on the map.
 * Without them the evidence still saves, but stays off the map and out of
 * travel-time checks.
 */
export function LocationCoordinates({ locationName, lat, lng, onChange }: LocationCoordinatesProps) {
  const [mapOpen, setMapOpen] = useState(false);
  const [latText, setLatText] = useState(formatCoord(lat));
  const [lngText, setLngText] = useState(formatCoord(lng));
  const [finding, setFinding] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Keep the text boxes in sync when coordinates change elsewhere (map click,
  // picking a known location, photo GPS) without clobbering half-typed input.
  useEffect(() => {
    if (Number(latText) !== lat || latText === "") setLatText(formatCoord(lat));
    if (Number(lngText) !== lng || lngText === "") setLngText(formatCoord(lng));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  const hasCoords = lat != null && lng != null;

  function commitTyped(nextLat: string, nextLng: string) {
    const la = Number(nextLat);
    const ln = Number(nextLng);
    const valid = nextLat.trim() !== "" && nextLng.trim() !== "" && Math.abs(la) <= 90 && Math.abs(ln) <= 180;
    if (valid && Number.isFinite(la) && Number.isFinite(ln)) onChange(la, ln);
    else if (nextLat.trim() === "" && nextLng.trim() === "") onChange(null, null);
  }

  async function handleFind() {
    const query = locationName.trim();
    if (!query) return;
    setFinding(true);
    setMessage(null);
    try {
      const result = await geocodePlace(query);
      onChange(result.lat, result.lng);
      setMessage({ tone: "ok", text: result.label });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : `No coordinates found for "${query}".`,
      });
    } finally {
      setFinding(false);
    }
  }

  function handlePick(la: number, ln: number) {
    onChange(Number(la.toFixed(6)), Number(ln.toFixed(6)));
    setMessage(null);
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input
          value={latText}
          onChange={(e) => {
            setLatText(e.target.value);
            commitTyped(e.target.value, lngText);
          }}
          placeholder="Latitude"
          inputMode="decimal"
          aria-label="Latitude"
          className={inputClass}
        />
        <input
          value={lngText}
          onChange={(e) => {
            setLngText(e.target.value);
            commitTyped(latText, e.target.value);
          }}
          placeholder="Longitude"
          inputMode="decimal"
          aria-label="Longitude"
          className={inputClass}
        />
        <button
          type="button"
          onClick={handleFind}
          disabled={!locationName.trim() || finding}
          title={locationName.trim() ? `Look up coordinates for "${locationName.trim()}"` : "Type a location first"}
          className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded border px-2 py-1 text-xs hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {finding ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          Find
        </button>
        <button
          type="button"
          onClick={() => setMapOpen((open) => !open)}
          aria-pressed={mapOpen}
          className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded border px-2 py-1 text-xs hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
          style={
            mapOpen
              ? { borderColor: "var(--accent)", color: "var(--accent)" }
              : { borderColor: "var(--border)", color: "var(--text)" }
          }
        >
          <MapPin size={12} />
          {mapOpen ? "Hide map" : "Pick on map"}
        </button>
      </div>

      {message ? (
        <p className={`truncate text-[11px] ${message.tone === "ok" ? "text-emerald-400/80" : "text-red-400"}`} title={message.text}>
          {message.text}
        </p>
      ) : (
        !hasCoords && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            No coordinates — this evidence won't appear on the map or in travel-time checks.
          </p>
        )
      )}

      {mapOpen && (
        <div className="isolate h-48 w-full overflow-hidden rounded border" style={{ borderColor: "var(--border)" }}>
          <MapContainer
            center={hasCoords ? [lat, lng] : DEFAULT_CENTER}
            zoom={hasCoords ? 15 : 11}
            scrollWheelZoom
            className="map-dark h-full w-full"
            style={{ height: "100%", width: "100%", cursor: "crosshair" }}
          >
            <BaseTiles />
            <ClickToPick onPick={handlePick} />
            <FollowPin lat={lat} lng={lng} />
            {hasCoords && (
              <Marker
                position={[lat, lng]}
                icon={markerIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const p = (e.target as L.Marker).getLatLng();
                    handlePick(p.lat, p.lng);
                  },
                }}
              />
            )}
          </MapContainer>
        </div>
      )}
      {mapOpen && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Click the map to drop the pin, or drag it to adjust.
        </p>
      )}
    </div>
  );
}

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Pan to the pin when it moves from outside the map (Find, typed coords), keeping the current zoom. */
function FollowPin({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (lat == null || lng == null) return;
    if (!map.getBounds().contains([lat, lng])) map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [map, lat, lng]);
  return null;
}
