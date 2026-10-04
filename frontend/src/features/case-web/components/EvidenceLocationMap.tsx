import { ExternalLink, MapPin } from "lucide-react";
import { MapPreview } from "../../../components/MapPreview";
import { buildGoogleMapsLocationUrl } from "../../../utils/googleMaps";
import { getEvidenceCoordinates, locationSourceLabel } from "../locationUtils";
import { formatClockWithSeconds } from "../timeUtils";
import type { Evidence } from "../types";

/** "Location" section of the evidence detail panel. Renders a map only when the evidence has a valid lat/lng pair. */
export function EvidenceLocationMap({ evidence }: { evidence: Evidence }) {
  const coords = getEvidenceCoordinates(evidence);

  return (
    <div className="mb-3">
      <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <MapPin size={11} /> Location
      </h3>

      {coords ? (
        <div className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)]">
          <div>
            <p className="mb-1.5 text-sm text-neutral-200">{evidence.location.name}</p>
            <dl className="space-y-1 font-mono text-xs">
              <Field label="Time" value={formatClockWithSeconds(evidence.eventTime)} />
              <Field label="Lat" value={coords.lat.toFixed(6)} />
              <Field label="Lng" value={coords.lng.toFixed(6)} />
              <Field label="Source" value={locationSourceLabel(evidence)} />
            </dl>
            <a
              href={buildGoogleMapsLocationUrl({ latitude: coords.lat, longitude: coords.lng }) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
            >
              Open in Google Maps <ExternalLink size={10} />
            </a>
          </div>
          <MapPreview
            latitude={coords.lat}
            longitude={coords.lng}
            zoom={15}
            heightClass="h-44"
            variant="dark"
            scrollWheelZoom={false}
          />
        </div>
      ) : (
        <p className="rounded border border-dashed border-neutral-800 px-3 py-2 text-xs text-neutral-500">
          No locational data
          {evidence.location?.name ? (
            <span className="text-neutral-600"> — reported as "{evidence.location.name}", no coordinates</span>
          ) : null}
        </p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-12 flex-shrink-0 text-neutral-600">{label}</dt>
      <dd className="text-neutral-300">{value}</dd>
    </div>
  );
}
