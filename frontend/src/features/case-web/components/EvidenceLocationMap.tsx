import { ExternalLink, MapPin } from "lucide-react";
import { MapPreview } from "../../../components/MapPreview";
import { buildGoogleMapsLocationUrl } from "../../../utils/googleMaps";
import { getEvidenceCoordinates, locationSourceLabel } from "../locationUtils";
import { formatDateTime } from "../timeUtils";
import type { Evidence } from "../types";

/** "Location" section of the evidence detail panel. Renders a map only when the evidence has a valid lat/lng pair. */
export function EvidenceLocationMap({ evidence }: { evidence: Evidence }) {
  const coords = getEvidenceCoordinates(evidence);

  return (
    <div className="mb-3">
      <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        <MapPin size={11} /> Location
      </h3>

      {coords ? (
        <div className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)]">
          <div>
            <p className="mb-1.5 text-sm" style={{ color: "var(--text)" }}>{evidence.location.name}</p>
            <dl className="space-y-1 font-mono text-xs">
              <Field label="Time" value={formatDateTime(evidence.eventTime, true)} />
              <Field label="Lat" value={coords.lat.toFixed(6)} />
              <Field label="Lng" value={coords.lng.toFixed(6)} />
              <Field label="Source" value={locationSourceLabel(evidence)} />
            </dl>
            <a
              href={buildGoogleMapsLocationUrl({ latitude: coords.lat, longitude: coords.lng }) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[11px] hover:brightness-110"
              style={{ color: "var(--accent)" }}
            >
              Open in Google Maps <ExternalLink size={10} />
            </a>
          </div>
          <MapPreview
            latitude={coords.lat}
            longitude={coords.lng}
            zoom={15}
            heightClass="h-44"
            // UPDATED line 43: was "light" — restored to match the original EvidenceLocationMap (HEAD d99c4fe) for the dark theme
            variant="dark"
            scrollWheelZoom={false}
          />
        </div>
      ) : (
        <p className="rounded border border-dashed px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No locational data
          {evidence.location?.name ? (
            <span style={{ color: "var(--text-muted)" }}> — reported as "{evidence.location.name}", no coordinates</span>
          ) : null}
        </p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-12 flex-shrink-0" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd style={{ color: "var(--text)" }}>{value}</dd>
    </div>
  );
}
