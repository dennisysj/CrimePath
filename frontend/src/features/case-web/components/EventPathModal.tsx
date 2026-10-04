// RESTORED from commit d99c4fe (HEAD, the commit immediately before the in-place "PathView" redesign
// replaced this pop-out). Layout and structure (subject chips, map + event list side by side, Google
// Maps link, close button) are unchanged from that commit. Per "keep these path improvements inside
// the restored pop-out, without changing its layout," the map itself (previously the shared
// EventPathMap.tsx component) is now built inline here so it can carry: numbered markers in time order,
// a polyline with arrowheads, red-dashed conflict segments with a "needs ~X · has ~Y" tooltip, and a
// marker click that selects the evidence (shown in the bottom panel) instead of opening a popup-only view.
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLink } from "lucide-react";
import { BaseTiles } from "../../../components/mapTiles";
import { PolylineDecoratorLayer } from "../../../components/PolylineDecoratorLayer";
import { buildGoogleMapsRouteUrl } from "../../../utils/googleMaps";
import { EVIDENCE_TYPE_LABEL, MIN_ROUTE_POINTS, getRoutePoints } from "../locationUtils";
import { formatClock } from "../timeUtils";
import type { CaseAnalysis, Evidence, Subject } from "../types";
import { subjectColorFor } from "./subjectColors";
import { STATUS_COLORS } from "./statusColors";

interface EventPathModalProps {
  open: boolean;
  subjects: Subject[];
  evidence: Evidence[];
  analysis: CaseAnalysis; // ADDED: needed to find conflicts between consecutive points, for the red-dashed segments
  subjectId: string | null;
  onChangeSubject: (id: string) => void;
  onSelectEvidence: (id: string) => void;
  onClose: () => void;
}

const ACCENT = "#3D6AF2";

function sourceWithType(source: string, typeLabel: string): string {
  return source.toLowerCase() === typeLabel.toLowerCase() ? source : `${source} · ${typeLabel}`;
}

// ADDED: numbered marker icon with a conflict-aware fill, replacing EventPathMap's sequenceIcon (which
// had no notion of conflicts) so a point in conflict reads red at a glance, same as on the card timeline.
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

/** Chronological map of one subject's located evidence: numbered markers joined in time order. */
export function EventPathModal({
  open,
  subjects,
  evidence,
  analysis,
  subjectId,
  onChangeSubject,
  onSelectEvidence,
  onClose,
}: EventPathModalProps) {
  const pointCounts = useMemo(
    () => new Map(subjects.map((s) => [s.id, getRoutePoints(evidence, s.id).length])),
    [subjects, evidence]
  );
  const points = useMemo(() => (subjectId ? getRoutePoints(evidence, subjectId) : []), [evidence, subjectId]);
  const routeUrl = useMemo(() => buildGoogleMapsRouteUrl(points), [points]);
  const subject = subjects.find((s) => s.id === subjectId);
  const subjectColor = subject ? subjectColorFor(subjects, subject.id).bg : STATUS_COLORS.neutralLine; // ADDED: subject-color marker fill, replacing EventPathMap's fixed blue

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const routable = points.length >= MIN_ROUTE_POINTS;
  const positions = points.map((p) => [p.latitude, p.longitude] as [number, number]);

  // ADDED: conflict lookup, used both for the per-segment red-dashed styling/tooltip and for coloring a marker red.
  const conflictFor = (aId: string, bId: string) =>
    analysis.conflicts.find(
      (c) => (c.evidenceIds[0] === aId && c.evidenceIds[1] === bId) || (c.evidenceIds[0] === bId && c.evidenceIds[1] === aId)
    );
  const inConflict = (id: string) => analysis.conflicts.some((c) => c.evidenceIds.includes(id));

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
              {subject?.name ?? "Subject"} — Event Path
            </h2>
            {/* UPDATED: note text replaced with the exact wording the spec calls for, in place of the
                original's "The dashed line joins known positions; it is not a travel route." */}
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

        <div className="flex flex-wrap gap-1.5 border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
          {subjects.map((s) => {
            const count = pointCounts.get(s.id) ?? 0;
            const enabled = count >= MIN_ROUTE_POINTS;
            const active = s.id === subjectId;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!enabled}
                onClick={() => onChangeSubject(s.id)}
                title={enabled ? undefined : `${s.name} has ${count} located event${count === 1 ? "" : "s"} — at least ${MIN_ROUTE_POINTS} are needed for a path`}
                className="rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
                style={
                  active
                    ? { borderColor: "var(--accent)", background: "rgba(61,106,242,0.1)", color: "var(--accent)" }
                    : { borderColor: "var(--border)", color: "var(--text)" }
                }
              >
                {s.name} <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{count}</span>
              </button>
            );
          })}
        </div>

        {routable ? (
          <div className="thin-scrollbar grid flex-1 gap-4 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_17rem]">
            {/* UPDATED: this used to be `<EventPathMap>` (plain polyline, no conflict awareness, fixed
                blue markers, no click-to-select). Built inline now so it can carry the kept path
                improvements without changing EventPathMap.tsx (still used elsewhere). */}
            <div className="isolate h-[min(26rem,55vh)] w-full overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <MapContainer center={positions[0] ?? [0, 0]} zoom={13} scrollWheelZoom className="map-dark h-full w-full" style={{ height: "100%", width: "100%" }}>
                <FitEventBounds positions={positions} />
                <BaseTiles />

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
                          : { color: ACCENT, weight: 4, opacity: 0.9, dashArray: "10 8" }
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

                {positions.length >= 2 && <PolylineDecoratorLayer positions={positions} color={ACCENT} />}

                {points.map((p, i) => (
                  <Marker
                    key={p.id}
                    position={[p.latitude, p.longitude]}
                    icon={markerIcon(i + 1, inConflict(p.evidence.id) ? STATUS_COLORS.conflictRing : subjectColor)}
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
                        <p style={{ margin: "6px 0 0" }}>Time: {formatClock(p.capturedAt)}</p>
                        <p style={{ margin: "2px 0 0" }}>{sourceWithType(p.source, EVIDENCE_TYPE_LABEL[p.evidence.evidenceType] ?? p.evidence.evidenceType)}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>

            <ol className="thin-scrollbar max-h-[min(26rem,55vh)] overflow-y-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              {points.map((p, i) => (
                <li key={p.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
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
                      style={{ borderColor: "var(--accent)", background: "var(--accent)", color: "var(--accent-text)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs" style={{ color: "var(--text)" }}>
                        <span className="font-mono" style={{ color: "var(--text-muted)" }}>{formatClock(p.capturedAt)}</span> — {p.locationName || "Unnamed location"}
                      </span>
                      <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
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
            {subject ? `${subject.name} doesn't have enough located evidence for a path.` : "Pick a subject above."}
          </p>
        )}

        <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
          <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
            {points.length} located event{points.length === 1 ? "" : "s"}
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
