import { useMemo, useState } from "react";
import { MapPreview } from "../components/MapPreview";
import { EventPathMap, EventPopupContent, formatCapturedAt, type LocationEvent } from "../components/EventPathMap";
import {
  buildGoogleMapsLocationUrl,
  buildGoogleMapsRouteUrl,
  eventsWithLocations,
  isValidLocation,
} from "../utils/googleMaps";

/**
 * Dummy event locations for this prototype.
 * Replace this array with the event list returned by the backend API.
 * Events without a valid latitude and longitude are ignored by the map.
 */
const events: LocationEvent[] = [
  {
    id: 1,
    name: "Event 1",
    capturedAt: "2026-10-03T14:31:22",
    latitude: 49.27880833333333,
    longitude: -122.91800555555557,
    source: "Image EXIF",
  },
  {
    id: 2,
    name: "Event 2",
    capturedAt: "2026-10-03T14:45:00",
    latitude: 49.275,
    longitude: -122.93,
    source: "CCTV",
  },
  {
    id: 3,
    name: "Event 3",
    capturedAt: "2026-10-03T15:05:00",
    latitude: 49.268,
    longitude: -122.945,
    source: "Phone GPS",
  },
];

type ViewMode = "single" | "path";

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm text-neutral-100">{value}</dd>
    </div>
  );
}

export function TestImageLocation() {
  const [mode, setMode] = useState<ViewMode>("single");
  const [selectedId, setSelectedId] = useState(events[0]?.id ?? 0);
  const located = useMemo(() => eventsWithLocations(events), []);
  const selected = events.find((event) => event.id === selectedId) ?? events[0];
  const selectedOrder = selected ? located.findIndex((event) => event.id === selected.id) + 1 : 0;
  const hasLocation = selected != null && isValidLocation(selected);
  const mapsUrl = selected ? buildGoogleMapsLocationUrl(selected) : null;
  const routeUrl = useMemo(() => buildGoogleMapsRouteUrl(events), []);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Prototype</p>
      <h1 className="mt-1 text-2xl font-semibold text-neutral-100">Image location test</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-400">
        Check one event location, or the known sequence of evidence locations in time order.
      </p>

      <div className="mt-6 inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-1">
        <button
          type="button"
          aria-pressed={mode === "single"}
          className={`rounded-md px-3 py-1.5 text-sm ${
            mode === "single" ? "bg-neutral-100 font-medium text-neutral-950" : "text-neutral-300"
          }`}
          onClick={() => setMode("single")}
        >
          Single Location
        </button>
        <button
          type="button"
          aria-pressed={mode === "path"}
          className={`rounded-md px-3 py-1.5 text-sm ${
            mode === "path" ? "bg-neutral-100 font-medium text-neutral-950" : "text-neutral-300"
          }`}
          onClick={() => setMode("path")}
        >
          Show Event Path
        </button>
      </div>

      {mode === "single" && selected && (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                aria-pressed={event.id === selected.id}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  event.id === selected.id
                    ? "border-neutral-100 bg-neutral-100 font-medium text-neutral-950"
                    : "border-neutral-700 text-neutral-200"
                }`}
                onClick={() => setSelectedId(event.id)}
              >
                {event.name}
              </button>
            ))}
          </div>

          <section className="mt-6">
            <h2 className="text-lg font-medium text-neutral-100">Event metadata</h2>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MetadataRow label="Event" value={selected.name} />
              <MetadataRow label="Captured time" value={formatCapturedAt(selected.capturedAt)} />
              <MetadataRow label="Timestamp" value={selected.capturedAt || "—"} />
              <MetadataRow label="Source" value={selected.source || "—"} />
              <MetadataRow
                label="Latitude"
                value={selected.latitude == null ? "—" : String(selected.latitude)}
              />
              <MetadataRow
                label="Longitude"
                value={selected.longitude == null ? "—" : String(selected.longitude)}
              />
            </dl>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium text-neutral-100">Map</h2>
            <div className="mt-3">
              <MapPreview
                latitude={selected.latitude}
                longitude={selected.longitude}
                popup={
                  hasLocation ? <EventPopupContent event={selected} order={selectedOrder} /> : undefined
                }
              />
            </div>
            {mapsUrl && (
              <a
                className="mt-4 inline-flex rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950"
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps
              </a>
            )}
          </section>
        </>
      )}

      {mode === "path" && (
        <section className="mt-8">
          <h2 className="text-lg font-medium text-neutral-100">Known event sequence</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-400">
            The dashed line only connects known evidence locations in chronological order. It is not a
            driving or walking route.
          </p>
          <div
            className={
              located.length > 0
                ? "mt-4 grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_16rem]"
                : "mt-4"
            }
          >
            <EventPathMap events={events} />
            {located.length > 0 && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <h3 className="text-sm font-medium text-neutral-100">Chronological order</h3>
                <ol className="mt-3 space-y-3">
                  {located.map((event, index) => (
                    <li key={event.id} className="border-t border-neutral-800 pt-3 first:border-t-0 first:pt-0">
                      <p className="text-sm font-medium text-neutral-100">
                        {index + 1}. {event.name}
                      </p>
                      <p className="mt-1 text-xs text-neutral-300">{formatCapturedAt(event.capturedAt)}</p>
                      <p className="mt-1 text-xs text-neutral-500">{event.source}</p>
                      <p className="mt-1 font-mono text-xs text-neutral-400">
                        {event.latitude}, {event.longitude}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <div className="mt-4 max-w-xl rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-4">
            <p className="text-sm text-neutral-300">
              Open these known locations as ordered stops in Google Maps.
            </p>
            <button
              type="button"
              disabled={routeUrl == null}
              className={`mt-3 inline-flex rounded-md px-4 py-2 text-sm font-medium ${
                routeUrl == null
                  ? "cursor-not-allowed bg-neutral-800 text-neutral-500"
                  : "bg-neutral-100 text-neutral-950"
              }`}
              onClick={() => {
                if (!routeUrl) return;
                window.open(routeUrl, "_blank", "noopener,noreferrer");
              }}
            >
              Open Route in Google Maps
            </button>
            {routeUrl == null && (
              <p className="mt-2 text-sm text-neutral-400">
                At least two GPS locations are required to open a route.
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
