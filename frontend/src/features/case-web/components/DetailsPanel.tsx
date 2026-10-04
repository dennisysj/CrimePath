import type { ReactNode } from "react";
import { FileText, Paperclip, Pencil, Trash2 } from "lucide-react";
import type { AiSuggestion, CaseAnalysis, Evidence, Subject } from "../types";
import type { Selection } from "../store";
import { formatClock, formatClockWithSeconds } from "../timeUtils";
import { formatBytes } from "../attachmentUtils";

interface DetailsPanelProps {
  subjects: Subject[];
  evidence: Evidence[];
  analysis: CaseAnalysis;
  selection: Selection;
  onSelectEvidence: (id: string) => void;
  onEditEvidence: (evidence: Evidence) => void;
  onRemoveEvidence: (id: string) => void;
  onConfirmSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
}

const EVIDENCE_TYPE_LABEL: Record<Evidence["evidenceType"], string> = {
  witness: "Witness",
  cctv: "CCTV",
  image: "Image", // UPDATED line 18-27: map replaced (was witness/cctv/gps/phone/transaction/transit/police/digital/other)
  video: "Video",
  document: "Document",
  transaction: "Transaction",
  other: "Other",
};

/**
 * Selected-evidence details (when something is selected) plus an always-
 * visible Insights list (conflicts, gaps, pending AI suggestions). AI
 * suggestions are confirmed/dismissed here — the investigator's call, not
 * the engine's or Gemini's.
 */
export function DetailsPanel({
  subjects,
  evidence,
  analysis,
  selection,
  onSelectEvidence,
  onEditEvidence,
  onRemoveEvidence,
  onConfirmSuggestion,
  onDismissSuggestion,
}: DetailsPanelProps) {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const selectedEvidence = selection?.type === "evidence" ? evidenceById.get(selection.id) : undefined;

  function labelFor(id: string): string {
    const e = evidenceById.get(id);
    if (!e) return id;
    const subject = subjectById.get(e.subjectId);
    return `${subject?.name ?? "?"} · ${formatClock(e.eventTime)}`;
  }

  const relatedConflicts = selectedEvidence
    ? analysis.conflicts.filter((c) => c.evidenceIds.includes(selectedEvidence.id))
    : [];
  const relatedCorroborations = selectedEvidence
    ? analysis.corroborations.filter((c) => c.evidenceIds.includes(selectedEvidence.id))
    : [];
  const relatedSuggestions = selectedEvidence
    ? analysis.aiSuggestions.filter((s) => s.evidenceIds.includes(selectedEvidence.id))
    : [];
  const hasConnections = relatedConflicts.length > 0 || relatedCorroborations.length > 0 || relatedSuggestions.length > 0;

  const pendingAndConfirmed = analysis.aiSuggestions.filter((s) => s.status !== "dismissed");

  return (
    <div className="thin-scrollbar flex h-full flex-col overflow-y-auto">
      {selectedEvidence && (
        <section className="border-b border-neutral-800 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Selected Evidence</h2>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onEditEvidence(selectedEvidence)}
                className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:border-neutral-500 hover:text-white"
              >
                <Pencil size={11} /> Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Remove this evidence? This can't be undone.")) onRemoveEvidence(selectedEvidence.id);
                }}
                className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-red-500/60 hover:text-red-400"
              >
                <Trash2 size={11} /> Delete
              </button>
            </div>
          </div>
          <p className="mb-2 text-sm font-medium text-neutral-100">{selectedEvidence.event}</p>
          <dl className="space-y-1 font-mono text-xs">
            <Row label="Subject" value={subjectById.get(selectedEvidence.subjectId)?.name ?? "Unknown"} />
            <Row label="Type" value={EVIDENCE_TYPE_LABEL[selectedEvidence.evidenceType]} />
            <Row
              label="Time"
              value={
                selectedEvidence.timeCertainty === "exact"
                  ? formatClockWithSeconds(selectedEvidence.eventTime)
                  : `${formatClock(selectedEvidence.earliestPossibleTime)}–${formatClock(
                      selectedEvidence.latestPossibleTime
                    )} (reported ${formatClock(selectedEvidence.eventTime)})`
              }
            />
            <Row
              label="Location"
              value={`${selectedEvidence.location.name} (${selectedEvidence.location.lat.toFixed(4)}, ${selectedEvidence.location.lng.toFixed(4)})`}
            />
            <Row label="Source" value={selectedEvidence.source} />
            {selectedEvidence.notes && <Row label="Notes" value={selectedEvidence.notes} />}
          </dl>

          {selectedEvidence.attachments && selectedEvidence.attachments.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <Paperclip size={11} /> Attachments ({selectedEvidence.attachments.length})
              </h3>
              <ul className="space-y-1.5">
                {selectedEvidence.attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={a.previewUrl} // UPDATED line 105: was a.dataUrl
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 hover:border-neutral-600"
                    >
                      {a.mimeType.startsWith("image/") ? ( // UPDATED line 110: was a.type
                        <img src={a.previewUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded object-cover" /> // UPDATED line 111: was a.dataUrl
                      ) : (
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-neutral-800 text-neutral-500">
                          <FileText size={16} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-neutral-300">{a.name}</p>
                        <p className="font-mono text-[10px] text-neutral-600">{formatBytes(a.size)}</p>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasConnections && (
            <div className="mt-3 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Connections</h3>
              {relatedConflicts.map((c) => (
                <ConnectionNote
                  key={c.id}
                  tone={c.resolvedByUncertainty ? "neutral" : "red"}
                  badge={c.resolvedByUncertainty ? "Compatible within uncertainty window" : "Possible conflict"}
                  text={c.explanation}
                />
              ))}
              {relatedCorroborations.map((c) => (
                <ConnectionNote key={c.id} tone="neutral" badge="Corroboration" text={c.explanation} />
              ))}
              {relatedSuggestions.map((s) => (
                <SuggestionNote
                  key={s.id}
                  suggestion={s}
                  onConfirm={() => onConfirmSuggestion(s.id)}
                  onDismiss={() => onDismissSuggestion(s.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="flex-1 space-y-5 p-4">
        <InsightGroup title={`Conflicts (${analysis.conflicts.length})`}>
          {analysis.conflicts.length === 0 && <Empty text="No conflicts detected." />}
          {analysis.conflicts.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectEvidence(c.evidenceIds[0])}
              className="block w-full rounded border border-neutral-800 p-2 text-left text-xs hover:border-neutral-600"
            >
              <span
                className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  c.resolvedByUncertainty ? "bg-neutral-800 text-neutral-300" : "bg-red-500/15 text-red-400"
                }`}
              >
                {c.resolvedByUncertainty ? "Compatible within uncertainty window" : "Possible conflict"}
              </span>
              <p className="text-neutral-400">{c.explanation}</p>
              <p className="mt-1 font-mono text-[10px] text-neutral-600">
                {labelFor(c.evidenceIds[0])} ↔ {labelFor(c.evidenceIds[1])}
              </p>
            </button>
          ))}
        </InsightGroup>

        <InsightGroup title={`Gaps (${analysis.gaps.length})`}>
          {analysis.gaps.length === 0 && <Empty text="No unaccounted gaps." />}
          {analysis.gaps.map((g) => (
            <div key={g.id} className="rounded border border-neutral-800 p-2 text-xs">
              <p className="text-neutral-300">
                {subjectById.get(g.subjectId)?.name ?? "Unknown"} — {Math.round(g.durationMinutes)} min unaccounted
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-neutral-600">
                {formatClock(g.start)} – {formatClock(g.end)}
              </p>
            </div>
          ))}
        </InsightGroup>

        <InsightGroup title={`AI Suggestions (${pendingAndConfirmed.length})`}>
          {pendingAndConfirmed.length === 0 && <Empty text="No pending suggestions." />}
          {pendingAndConfirmed.map((s) => (
            <SuggestionNote
              key={s.id}
              suggestion={s}
              onConfirm={() => onConfirmSuggestion(s.id)}
              onDismiss={() => onDismissSuggestion(s.id)}
            />
          ))}
        </InsightGroup>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 flex-shrink-0 text-neutral-600">{label}</dt>
      <dd className="text-neutral-300">{value}</dd>
    </div>
  );
}

function InsightGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-neutral-600">{text}</p>;
}

function ConnectionNote({ tone, badge, text }: { tone: "red" | "neutral"; badge: string; text: string }) {
  return (
    <div className="rounded border border-neutral-800 p-2 text-xs">
      <span
        className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
          tone === "red" ? "bg-red-500/15 text-red-400" : "bg-neutral-800 text-neutral-300"
        }`}
      >
        {badge}
      </span>
      <p className="text-neutral-400">{text}</p>
    </div>
  );
}

function SuggestionNote({
  suggestion,
  onConfirm,
  onDismiss,
}: {
  suggestion: AiSuggestion;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded border border-purple-500/30 bg-purple-500/5 p-2 text-xs">
      <span className="mb-1 inline-block rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
        {suggestion.status === "confirmed" ? "Confirmed" : "AI suggestion"}
      </span>
      <p className="text-neutral-300">{suggestion.reasoning}</p>
      <p className="mt-1 italic text-neutral-500">Suggested question: {suggestion.suggestedQuestion}</p>
      {suggestion.status === "pending" && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={onConfirm}
            className="rounded bg-purple-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-purple-500"
          >
            Confirm
          </button>
          <button
            onClick={onDismiss}
            className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 hover:text-neutral-200"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
