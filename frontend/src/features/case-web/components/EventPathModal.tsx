// RESTORED from commit d99c4fe (HEAD, the commit immediately before the in-place "PathView" redesign
// replaced this pop-out). Layout and structure (subject chips, map + event list side by side, Google
// Maps link, close button) are unchanged from that commit. Per "keep these path improvements inside
// the restored pop-out, without changing its layout," the map itself (previously the shared
// EventPathMap.tsx component) is now built inline here so it can carry: numbered markers in time order,
// a polyline with arrowheads, red-dashed conflict segments with a "needs ~X · has ~Y" tooltip, and a
// marker click that selects the evidence (shown in the bottom panel) instead of opening a popup-only view.
//
// Several subjects can be shown at once: each path is drawn in its subject's color and numbered on its
// own. Red is reserved for flagged conflicts — a segment or marker is only red when the analysis has a
// conflict for it (the subject palette contains no red).
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLink } from "lucide-react";
import { BaseTiles } from "../../../components/mapTiles";
import { PolylineDecoratorLayer } from "../../../components/PolylineDecoratorLayer";
import { buildGoogleMapsRouteUrl } from "../../../utils/googleMaps";
import { EVIDENCE_TYPE_LABEL, MIN_ROUTE_POINTS, getRoutePoints } from "../locationUtils";
import { formatDateTime } from "../timeUtils";
import type { CaseAnalysis, Evidence, Subject } from "../types";
import { subjectColorFor } from "./subjectColors";
import { STATUS_COLORS } from "./statusColors";

interface EventPathModalProps {
  open: boolean;
  subjects: Subject[];
  evidence: Evidence[];
  analysis: CaseAnalysis; // needed to find conflicts between consecutive points, for the red-dashed segments
  /** Subjects whose paths are shown. */
  subjectIds: string[];
  onChangeSubjects: (ids: string[]) => void;
  onSelectEvidence: (id: string) => void;
  onClose: () => void;
}

function sourceWithType(source: string, typeLabel: string): string {
  return source.toLowerCase() === typeLabel.toLowerCase() ? source : `${source} · ${typeLabel}`;
}

// Numbered marker icon with a conflict-aware fill, so a point in conflict reads red at a glance, same as
// on the card timeline; otherwise it uses the subject's color.
function markerIcon(order: number, color: string) {
  return L.divIcon({
    className: "event-sequence-marker",
    html: `<span style="display:flex;height:28px;width:28px;align-items:center;justify-content:center;border-radius:9999px;border:2px solid #ffffff;background:${color};color:#fff;font:700 13px ui-sans-serif,system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.5);">${order}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function FitEventBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const key = positions.map(([lat, lng]) => `${lat},${lng}`).join("|");

  useEffect(() => {
    const points = key
      .split("|")
      .filter(Boolean)
      .map((pair) => pair.split(",").map(Number) as [number, number]);
    if (points.length === 0) return;
    const apply = () => {
      map.invalidateSize();
      if (points.length === 1) map.setView(points[0], 16);
      else map.fitBounds(points, { padding: [56, 56], maxZoom: 15 });
    };
    apply();
    const t = window.setTimeout(apply, 200);
    return () => window.clearTimeout(t);
  }, [map, key]);

  return null;
}

/** Chronological map of one or more subjects' located evidence: numbered markers joined in time order. */
export function EventPathModal({
  open,
  subjects,
  evidence,
  analysis,
  subjectIds,
  onChangeSubjects,
  onSelectEvidence,
  onClose,
}: EventPathModalProps) {
  const pointCounts = useMemo(
    () => new Map(subjects.map((s) => [s.id, getRoutePoints(evidence, s.id).length])),
    [subjects, evidence]
  );

  // One path per selected subject that has enough located evidence, in the subjects' list order.
  const paths = useMemo(
    () =>
      subjects
        .filter((s) => subjectIds.includes(s.id))
        .map((s) => ({ subject: s, color: subjectColorFor(subjects, s.id).bg, points: getRoutePoints(evidence, s.id) }))
        .filter((p) => p.points.length >= MIN_ROUTE_POINTS),
    [subjects, subjectIds, evidence]
  );

  // Right-hand list: every point of every shown path, in time order, keeping each path's own numbering.
  const listItems = useMemo(
    () =>
      paths
        .flatMap((path) => path.points.map((point, i) => ({ path, point, order: i + 1 })))
        .sort((a, b) => new Date(a.point.capturedAt).getTime() - new Date(b.point.capturedAt).getTime()),
    [paths]
  );

  const routeUrl = useMemo(() => (paths.length === 1 ? buildGoogleMapsRouteUrl(paths[0].points) : null), [paths]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const allPositions = paths.flatMap((p) => p.points.map((pt) => [pt.latitude, pt.longitude] as [number, number]));
  const pointTotal = listItems.length;

  // Conflict lookup, used both for the per-segment red-dashed styling/tooltip and for coloring a marker red.
  const conflictFor = (aId: string, bId: string) =>
    analysis.conflicts.find(
      (c) => (c.evidenceIds[0] === aId && c.evidenceIds[1] === bId) || (c.evidenceIds[0] === bId && c.evidenceIds[1] === aId)
    );
  const inConflict = (id: string) => analysis.conflicts.some((c) => c.evidenceIds.includes(id));

  function toggleSubject(id: string) {
    onChangeSubjects(subjectIds.includes(id) ? subjectIds.filter((s) => s !== id) : [...subjectIds, id]);
  }

  const title =
    paths.length === 0 ? "Event Path" : `${paths.map((p) => p.subject.name).join(", ")} — Event Path${paths.length > 1 ? "s" : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border shadow-xl"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              {title}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Hypothetical path from evidence in time order. Not a confirmed route.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hover:brightness-75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
          <span className="mr-1 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Show paths for
          </span>
          {subjects.map((s) => {
            const count = pointCounts.get(s.id) ?? 0;
            const enabled = count >= MIN_ROUTE_POINTS;
            const active = subjectIds.includes(s.id);
            const color = subjectColorFor(subjects, s.id).bg;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!enabled}
                aria-pressed={active}
                onClick={() => toggleSubject(s.id)}
                title={enabled ? undefined : `${s.name} has ${count} located event${count === 1 ? "" : "s"} — at least ${MIN_ROUTE_POINTS} are needed for a path`}
                className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
                style={
                  active
                    ? { borderColor: color, background: `${color}26`, color: "var(--text)" }
                    : { borderColor: "var(--border)", color: "var(--text)" }
                }
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {s.name} <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{count}</span>
              </button>
            );
          })}
        </div>

        {paths.length > 0 ? (
          <div className="thin-scrollbar grid flex-1 gap-4 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="isolate h-[min(26rem,55vh)] w-full overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <MapContainer center={allPositions[0] ?? [0, 0]} zoom={13} scrollWheelZoom className="map-dark h-full w-full" style={{ height: "100%", width: "100%" }}>
                <FitEventBounds positions={allPositions} />
                <BaseTiles />

                {paths.map(({ subject, color, points }) => (
                  <PathLayer
                    key={subject.id}
                    color={color}
                    points={points}
                    conflictFor={conflictFor}
                    inConflict={inConflict}
                    onSelectEvidence={onSelectEvidence}
                  />
                ))}
              </MapContainer>
            </div>

            <ol className="thin-scrollbar max-h-[min(26rem,55vh)] overflow-y-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              {listItems.map(({ path, point: p, order }) => (
                <li key={`${path.subject.id}-${p.id}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectEvidence(p.id);
                      onClose();
                    }}
                    className="flex w-full gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                    title="Show this evidence in the detail panel"
                  >
                    <span
                      className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[11px] font-bold"
                      style={{
                        borderColor: inConflict(p.evidence.id) ? STATUS_COLORS.conflictRing : path.color,
                        background: inConflict(p.evidence.id) ? STATUS_COLORS.conflictRing : path.color,
                        color: "#fff",
                      }}
                    >
                      {order}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs" style={{ color: "var(--text)" }}>
                        <span className="font-mono" style={{ color: "var(--text-muted)" }}>{formatDateTime(p.capturedAt, true)}</span> - {p.locationName || "Unnamed location"}
                      </span>
                      <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {paths.length > 1 && <span style={{ color: path.color }}>{path.subject.name} · </span>}
                        {sourceWithType(p.source, EVIDENCE_TYPE_LABEL[p.evidence.evidenceType] ?? p.evidence.evidenceType)}
                      </span>
                      <span className="block font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            {subjectIds.length > 0
              ? "The selected subjects don't have enough located evidence for a path."
              : "Pick one or more subjects above."}
          </p>
        )}

        <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
          <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
            {pointTotal} located event{pointTotal === 1 ? "" : "s"}
            {paths.length > 1 && ` · ${paths.length} subjects`}
          </span>
          <div className="flex gap-2">
            {routeUrl && (
              <a
                href={routeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm hover:brightness-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
              >
                Open in Google Maps <ExternalLink size={12} />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm font-medium hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type RoutePoint = ReturnType<typeof getRoutePoints>[number];

/** One subject's path: segments (red-dashed only where a conflict is flagged), arrowheads, numbered markers. */
function PathLayer({
  color,
  points,
  conflictFor,
  inConflict,
  onSelectEvidence,
}: {
  color: string;
  points: RoutePoint[];
  conflictFor: (aId: string, bId: string) => CaseAnalysis["conflicts"][number] | undefined;
  inConflict: (id: string) => boolean;
  onSelectEvidence: (id: string) => void;
}) {
  const positions = points.map((p) => [p.latitude, p.longitude] as [number, number]);
  return (
    <>
      {points.map((p, i) => {
        if (i === 0) return null;
        const prev = points[i - 1];
        const conflict = conflictFor(prev.evidence.id, p.evidence.id);
        return (
          <Polyline
            key={`seg-${p.id}`}
            positions={[
              [prev.latitude, prev.longitude],
              [p.latitude, p.longitude],
            ]}
            pathOptions={
              conflict
                ? { color: STATUS_COLORS.conflictRing, weight: 4, opacity: 0.95, dashArray: "4 6" }
                : { color, weight: 4, opacity: 0.9, dashArray: "10 8" }
            }
          >
            {conflict && (
              <Tooltip sticky className="event-sequence-tooltip">
                needs ~{Math.round(conflict.requiredMinutes)} · has ~{Math.round(conflict.availableMinutes)}
              </Tooltip>
            )}
          </Polyline>
        );
      })}

      {positions.length >= 2 && <PolylineDecoratorLayer positions={positions} color={color} />}

      {points.map((p, i) => (
        <Marker
          key={p.id}
          position={[p.latitude, p.longitude]}
          icon={markerIcon(i + 1, inConflict(p.evidence.id) ? STATUS_COLORS.conflictRing : color)}
          zIndexOffset={(i + 1) * 10}
          eventHandlers={{ click: () => onSelectEvidence(p.evidence.id) }}
        >
          <Tooltip direction="top" offset={[0, -12]} className="event-sequence-tooltip">
            {i + 1}. {p.name}
          </Tooltip>
          <Popup className="event-popup">
            <div style={{ color: "#171717", fontSize: 13, lineHeight: 1.45 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>
                {i + 1}. {p.name}
              </p>
              <p style={{ margin: "6px 0 0" }}>Time: {formatDateTime(p.capturedAt, true)}</p>
              <p style={{ margin: "2px 0 0" }}>{sourceWithType(p.source, EVIDENCE_TYPE_LABEL[p.evidence.evidenceType] ?? p.evidence.evidenceType)}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
