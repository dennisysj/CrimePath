import { useEffect, useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { EventPathMap } from "../../../components/EventPathMap";
import { buildGoogleMapsRouteUrl } from "../../../utils/googleMaps";
import { EVIDENCE_TYPE_LABEL, MIN_ROUTE_POINTS, getRoutePoints } from "../locationUtils";
import { formatClock } from "../timeUtils";
import type { Evidence, Subject } from "../types";

interface EventPathModalProps {
  open: boolean;
  subjects: Subject[];
  evidence: Evidence[];
  subjectId: string | null;
  onChangeSubject: (id: string) => void;
  onSelectEvidence: (id: string) => void;
  onClose: () => void;
}

function sourceWithType(source: string, typeLabel: string): string {
  return source.toLowerCase() === typeLabel.toLowerCase() ? source : `${source} · ${typeLabel}`;
}

/** Chronological map of one subject's located evidence: numbered markers joined in time order. */
export function EventPathModal({
  open,
  subjects,
  evidence,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">
              {subject?.name ?? "Subject"} — Event Path
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Located evidence in chronological order. The dashed line joins known positions; it is not a travel route.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-200" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-neutral-800 px-5 py-3">
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
                className={`rounded-full border px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                {s.name} <span className="font-mono text-[10px] text-neutral-500">{count}</span>
              </button>
            );
          })}
        </div>

        {routable ? (
          <div className="thin-scrollbar grid flex-1 gap-4 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_17rem]">
            <EventPathMap
              key={subjectId ?? ""}
              events={points}
              heightClass="h-[min(26rem,55vh)]"
              variant="dark"
              permanentLabels={points.length <= 4}
            />

            <ol className="thin-scrollbar max-h-[min(26rem,55vh)] overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950/40">
              {points.map((p, i) => (
                <li key={p.id} className="border-b border-neutral-800 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectEvidence(p.id);
                      onClose();
                    }}
                    className="flex w-full gap-2.5 px-3 py-2 text-left hover:bg-neutral-900"
                    title="Show this evidence in the detail panel"
                  >
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-600 text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-neutral-200">
                        <span className="font-mono text-neutral-400">{formatClock(p.capturedAt)}</span> — {p.locationName || "Unnamed location"}
                      </span>
                      <span className="block text-[11px] text-neutral-500">
                        {sourceWithType(p.source, EVIDENCE_TYPE_LABEL[p.evidence.evidenceType] ?? p.evidence.evidenceType)}
                      </span>
                      <span className="block font-mono text-[10px] text-neutral-600">
                        {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-neutral-500">
            {subject ? `${subject.name} doesn't have enough located evidence for a path.` : "Pick a subject above."}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-neutral-800 px-5 py-3">
          <span className="font-mono text-xs text-neutral-500">
            {points.length} located event{points.length === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            {routeUrl && (
              <a
                href={routeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
              >
                Open in Google Maps <ExternalLink size={12} />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
