// UPDATED: this file was a slide-in drawer from the right edge, opened by a card's "+" button and
// overlaying the canvas. Restored to the original bottom-of-timeline panel (content taken from
// EvidenceDetailPanel.tsx at commit d99c4fe, the commit immediately before the drawer redesign),
// visible by default below the card timeline, now with an added collapse/expand toggle in its header.
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown, FileText, Paperclip } from "lucide-react";
import type { AiSuggestion, CaseAnalysis, Evidence, EvidenceType, Subject } from "../types";
import { ROLE_LABELS } from "../types";
import { formatClock, formatClockWithSeconds } from "../timeUtils";
import { formatBytes } from "../attachmentUtils";
import { formatLocationLabel } from "../locationUtils";
import { EvidenceLocationMap } from "./EvidenceLocationMap";
import { STATUS_COLORS } from "./statusColors";
import { readPersisted, writePersisted } from "./persistence";

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

const COLLAPSE_KEY = "crimepath:detailPanelCollapsed";
const CONTENT_MAX_HEIGHT = 384; // matches the original panel's `max-h-96` (24rem)

/**
 * Below the card timeline, visible by default. Shows a placeholder until a
 * card is selected, then that card's full detail. Collapsible via the
 * header's chevron (state persists in localStorage); collapsing it shrinks
 * this panel to just its header, handing the freed height back to the page.
 */
export function EvidenceDetailPanel({ evidence, subjects, analysis, onConfirmSuggestion, onDismissSuggestion }: EvidenceDetailPanelProps) {
  const [collapsed, setCollapsed] = useState(() => readPersisted(COLLAPSE_KEY, false));
  const reduceMotion = useReducedMotion();

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      writePersisted(COLLAPSE_KEY, next);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-md border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--border)" }}>
        <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
          {evidence ? evidence.source : "Evidence detail"}
        </span>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand evidence detail panel" : "Collapse evidence detail panel"}
          title={collapsed ? "Expand evidence detail panel" : "Collapse evidence detail panel"}
          className="rounded p-1 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
          style={{ color: "var(--text-muted)" }}
        >
          <motion.span className="flex" animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }}>
            <ChevronDown size={14} />
          </motion.span>
        </motion.button>
      </div>

      <motion.div
        initial={false}
        animate={{ height: collapsed ? 0 : CONTENT_MAX_HEIGHT }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 35 }}
        className="thin-scrollbar overflow-y-auto"
      >
        <div className="p-4 text-sm">
          {evidence ? (
            <DetailContent evidence={evidence} subjects={subjects} analysis={analysis} onConfirmSuggestion={onConfirmSuggestion} onDismissSuggestion={onDismissSuggestion} />
          ) : (
            <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              Click a card to see the full observation, attachments, and involved parties.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function DetailContent({
  evidence,
  subjects,
  analysis,
  onConfirmSuggestion,
  onDismissSuggestion,
}: Omit<EvidenceDetailPanelProps, "evidence"> & { evidence: Evidence }) {
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
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium" style={{ color: "var(--text)" }}>
          {evidence.source}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {EVIDENCE_TYPE_LABEL[evidence.evidenceType]}
        </span>
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
        <Row label="Subject" value={subjects.find((s) => s.id === evidence.subjectId)?.name ?? "Unknown"} />
      </dl>

      <p className="mb-3 text-sm" style={{ color: "var(--text)" }}>
        "{evidence.event}"
      </p>

      <div className="mb-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Involved
        </h3>
        <ul className="space-y-1">
          {involvedList.map((p, i) => {
            const s = subjects.find((su) => su.id === p.subjectId);
            return (
              <li key={i} className="flex items-center justify-between text-xs">
                <span style={{ color: "var(--text)" }}>{s?.name ?? "Unknown"}</span>
                <span style={{ color: "var(--text-muted)" }}>{p.role ? ROLE_LABELS[p.role] : "Primary subject"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <EvidenceLocationMap evidence={evidence} />

      {evidence.attachments && evidence.attachments.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            <Paperclip size={11} /> Attachments ({evidence.attachments.length})
          </h3>
          <ul className="space-y-1.5">
            {evidence.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded border p-1.5 hover:brightness-95"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                >
                  {a.mimeType.startsWith("image/") ? (
                    <img src={a.previewUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>
                      <FileText size={16} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs" style={{ color: "var(--text)" }}>
                      {a.name}
                    </p>
                    <p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {formatBytes(a.size)}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasConnections && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Connections
          </h3>
          {relatedConflicts.map((c) => (
            <Note key={c.id} tone="conflict" badge="Possible conflict" text={c.explanation} />
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
            <Note key={c.id} tone="linked" badge="Linked" text={c.explanation} />
          ))}
          {relatedSuggestions.map((s) => (
            <SuggestionNote key={s.id} suggestion={s} onConfirm={() => onConfirmSuggestion(s.id)} onDismiss={() => onDismissSuggestion(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 flex-shrink-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </dt>
      <dd style={{ color: "var(--text)" }}>{value}</dd>
    </div>
  );
}

const NOTE_TONE_COLOR: Record<"conflict" | "linked" | "neutral", string> = {
  conflict: STATUS_COLORS.conflict,
  linked: STATUS_COLORS.linked,
  neutral: "var(--text-muted)",
};

function Note({ tone, badge, text }: { tone: "conflict" | "linked" | "neutral"; badge: string; text: string }) {
  return (
    <div className="rounded border p-2 text-xs" style={{ borderColor: "var(--border)" }}>
      <span className="mb-1 inline-block rounded bg-white px-1.5 py-0.5 text-[10px] font-medium" style={{ color: NOTE_TONE_COLOR[tone] }}>
        {badge}
      </span>
      <p style={{ color: "var(--text-muted)" }}>{text}</p>
    </div>
  );
}

function SuggestionNote({ suggestion, onConfirm, onDismiss }: { suggestion: AiSuggestion; onConfirm: () => void; onDismiss: () => void }) {
  return (
    <div className="rounded border p-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <span className="mb-1 inline-block rounded bg-white px-1.5 py-0.5 text-[10px] font-medium" style={{ color: STATUS_COLORS.ai }}>
        {suggestion.status === "confirmed" ? "Confirmed" : "AI suggestion"}
      </span>
      <p style={{ color: "var(--text)" }}>{suggestion.reasoning}</p>
      <p className="mt-1 italic" style={{ color: "var(--text-muted)" }}>
        Suggested question: {suggestion.suggestedQuestion}
      </p>
      {suggestion.status === "pending" && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={onConfirm}
            className="rounded px-2 py-1 text-[11px] font-medium hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            Confirm
          </button>
          <button
            onClick={onDismiss}
            className="rounded border px-2 py-1 text-[11px] hover:brightness-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
