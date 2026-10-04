import { FileText, Paperclip } from "lucide-react";
import type { AiSuggestion, CaseAnalysis, Evidence, EvidenceType, Subject } from "../types";
import { ROLE_LABELS } from "../types";
import { formatClock, formatClockWithSeconds } from "../timeUtils";
import { formatBytes } from "../attachmentUtils";
import { formatLocationLabel } from "../locationUtils";
import { EvidenceLocationMap } from "./EvidenceLocationMap";

interface EvidenceDetailPanelProps {
  evidence: Evidence | undefined;
  subjects: Subject[];
  analysis: CaseAnalysis;
  onConfirmSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
}

const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  witness: "Witness",
  cctv: "CCTV",
  image: "Image",
  video: "Video",
  document: "Document",
  transaction: "Transaction",
  other: "Other",
};

/** Below the card timeline. Shows nothing until a card is selected — no standing insights list, per the card-timeline spec. */
export function EvidenceDetailPanel({
  evidence,
  subjects,
  analysis,
  onConfirmSuggestion,
  onDismissSuggestion,
}: EvidenceDetailPanelProps) {
  if (!evidence) {
    return (
      <div className="rounded-md border border-neutral-800 bg-neutral-950/40 p-6 text-center text-sm text-neutral-500">
        Click a card to see the full observation, attachments, and involved parties.
      </div>
    );
  }

  const relatedConflicts = analysis.conflicts.filter((c) => c.evidenceIds.includes(evidence.id));
  const relatedGaps = analysis.gaps.filter(
    (g) => g.subjectId === evidence.subjectId && (g.start === evidence.eventTime || g.end === evidence.eventTime)
  );
  const relatedCorroborations = analysis.corroborations.filter((c) => c.evidenceIds.includes(evidence.id));
  const relatedSuggestions = analysis.aiSuggestions.filter(
    (s) => s.evidenceIds.includes(evidence.id) && s.status !== "dismissed"
  );
  const hasConnections =
    relatedConflicts.length > 0 || relatedGaps.length > 0 || relatedCorroborations.length > 0 || relatedSuggestions.length > 0;

  const involvedList = [{ subjectId: evidence.subjectId, role: null }, ...(evidence.involvedParties ?? [])];

  return (
    <div className="thin-scrollbar max-h-96 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950/40 p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-neutral-100">{evidence.source}</span>
        <span className="text-xs text-neutral-500">{EVIDENCE_TYPE_LABEL[evidence.evidenceType]}</span>
      </div>

      <dl className="mb-3 space-y-1 font-mono text-xs">
        <Row
          label="Time"
          value={
            evidence.timeCertainty === "exact"
              ? formatClockWithSeconds(evidence.eventTime)
              : evidence.timeCertainty === "range"
                ? `${formatClock(evidence.earliestPossibleTime)}–${formatClock(evidence.latestPossibleTime)}`
                : `${formatClock(evidence.earliestPossibleTime)}–${formatClock(evidence.latestPossibleTime)} (reported ${formatClock(evidence.eventTime)})`
          }
        />
        <Row label="Location" value={formatLocationLabel(evidence)} />
      </dl>

      <p className="mb-3 text-sm text-neutral-300">"{evidence.event}"</p>

      <div className="mb-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Involved</h3>
        <ul className="space-y-1">
          {involvedList.map((p, i) => {
            const s = subjects.find((su) => su.id === p.subjectId);
            return (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="text-neutral-300">{s?.name ?? "Unknown"}</span>
                <span className="text-neutral-500">{p.role ? ROLE_LABELS[p.role] : "Primary subject"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <EvidenceLocationMap evidence={evidence} />

      {evidence.attachments && evidence.attachments.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <Paperclip size={11} /> Attachments ({evidence.attachments.length})
          </h3>
          <ul className="space-y-1.5">
            {evidence.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 hover:border-neutral-600"
                >
                  {a.mimeType.startsWith("image/") ? (
                    <img src={a.previewUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded object-cover" />
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
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Connections</h3>
          {relatedConflicts.map((c) => (
            <Note key={c.id} tone="red" badge="Possible conflict" text={c.explanation} />
          ))}
          {relatedGaps.map((g) => (
            <Note
              key={g.id}
              tone="neutral"
              badge="Gap"
              text={`${subjects.find((s) => s.id === g.subjectId)?.name ?? "Subject"} — ${Math.round(g.durationMinutes)} min unaccounted between ${formatClock(g.start)} and ${formatClock(g.end)}.`}
            />
          ))}
          {relatedCorroborations.map((c) => (
            <Note key={c.id} tone="neutral" badge="Linked" text={c.explanation} />
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

function Note({ tone, badge, text }: { tone: "red" | "neutral"; badge: string; text: string }) {
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
    <div className="rounded border border-sky-500/30 bg-sky-500/5 p-2 text-xs">
      <span className="mb-1 inline-block rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
        {suggestion.status === "confirmed" ? "Confirmed" : "AI suggestion"}
      </span>
      <p className="text-neutral-300">{suggestion.reasoning}</p>
      <p className="mt-1 italic text-neutral-500">Suggested question: {suggestion.suggestedQuestion}</p>
      {suggestion.status === "pending" && (
        <div className="mt-2 flex gap-2">
          <button onClick={onConfirm} className="rounded bg-sky-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-500">
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
