import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Expand, MapPin, X } from "lucide-react";
import { BaseTiles } from "../../../components/mapTiles";
import { getEvidenceCoordinates, EVIDENCE_TYPE_LABEL } from "../locationUtils";
import { formatDateTime } from "../timeUtils";
import type { Evidence, EvidenceType, Subject } from "../types";

const EVIDENCE_TYPE_COLOR: Record<EvidenceType, string> = {
  witness: "#FBBF24",
  cctv: "#38BDF8",
  image: "#34D399",
  video: "#A78BFA",
  document: "#94A3B8",
  gps: "#FB7185",
  transaction: "#F472B6",
  other: "#9CA3AF",
};

type Point = { evidence: Evidence; lat: number; lng: number };

interface EvidenceLocationsMapProps {
  evidence: Evidence[];
  subjects: Subject[];
  onSelectEvidence: (id: string) => void;
}

function FitToPoints({ points }: { points: Point[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    map.fitBounds(
      points.map((p) => [p.lat, p.lng]),
      { padding: [16, 16] }
    );
    // Big/small renderings of the same points live in different DOM nodes
    // (the modal unmounts the inline one), so each needs its own fit pass
    // rather than relying on a single shared map instance re-fitting itself.
  }, [map, points]);
  return null;
}

/** The actual Leaflet canvas, shared by the inline preview and the "view full map" modal. */
function MapCanvas({
  points,
  subjectById,
  onSelectEvidence,
  heightClass,
  scrollWheelZoom,
}: {
  points: Point[];
  subjectById: Map<string, Subject>;
  onSelectEvidence: (id: string) => void;
  heightClass: string;
  scrollWheelZoom: boolean;
}) {
  return (
    <div className={`${heightClass} w-full overflow-hidden rounded border border-neutral-800`}>
      <MapContainer
        center={[points[0].lat, points[0].lng]}
        zoom={12}
        scrollWheelZoom={scrollWheelZoom}
        className="map-dark h-full w-full"
      >
        <FitToPoints points={points} />
        <BaseTiles />
        {points.map((p) => (
          <CircleMarker
            key={p.evidence.id}
            center={[p.lat, p.lng]}
            radius={7}
            pathOptions={{
              color: EVIDENCE_TYPE_COLOR[p.evidence.evidenceType],
              fillColor: EVIDENCE_TYPE_COLOR[p.evidence.evidenceType],
              fillOpacity: 0.85,
              weight: 1.5,
            }}
            eventHandlers={{ click: () => onSelectEvidence(p.evidence.id) }}
          >
            <Popup className="event-popup">
              <div className="text-xs">
                <p className="font-medium">{subjectById.get(p.evidence.subjectId)?.name ?? p.evidence.subjectId}</p>
                <p className="text-neutral-500">{formatDateTime(p.evidence.eventTime, true)}</p>
                <p className="mt-1">{p.evidence.event}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

function Legend({ legend }: { legend: [EvidenceType, number][] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-400">
      {legend.map(([type, count]) => (
        <span key={type} className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EVIDENCE_TYPE_COLOR[type] }} />
          {EVIDENCE_TYPE_LABEL[type]} ({count})
        </span>
      ))}
    </div>
  );
}

export function EvidenceLocationsMap({ evidence, subjects, onSelectEvidence }: EvidenceLocationsMapProps) {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setMounted(true), []);

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const points = useMemo<Point[]>(
    () =>
      evidence
        .map((e) => {
          const coords = getEvidenceCoordinates(e);
          return coords ? { evidence: e, ...coords } : null;
        })
        .filter((p): p is Point => p !== null),
    [evidence]
  );

  const legend = useMemo(() => {
    const counts = new Map<EvidenceType, number>();
    for (const p of points) counts.set(p.evidence.evidenceType, (counts.get(p.evidence.evidenceType) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]) as [EvidenceType, number][];
  }, [points]);

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/70 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-200">
          <MapPin size={14} className="text-emerald-400" />
          Evidence Locations
        </h3>
        {points.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
          >
            View full map
            <Expand size={12} />
          </button>
        )}
      </div>

      {legend.length > 0 && <Legend legend={legend} />}

      {points.length === 0 ? (
        <p className="py-6 text-center text-xs text-neutral-500">No evidence with location data.</p>
      ) : !mounted ? (
        <div className="h-48 w-full rounded bg-neutral-900" aria-hidden />
      ) : (
        <MapCanvas
          points={points}
          subjectById={subjectById}
          onSelectEvidence={onSelectEvidence}
          heightClass="h-48"
          scrollWheelZoom={false}
        />
      )}

      {expanded && points.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950/95 p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-100">
              <MapPin size={16} className="text-emerald-400" />
              Evidence Locations
            </h2>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close map"
              className="rounded border border-neutral-700 p-2 text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <Legend legend={legend} />
          <div className="min-h-0 flex-1">
            <MapCanvas
              points={points}
              subjectById={subjectById}
              onSelectEvidence={(id) => {
                onSelectEvidence(id);
                setExpanded(false);
              }}
              heightClass="h-full"
              scrollWheelZoom
            />
          </div>
        </div>
      )}
    </div>
  );
}
