import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { MapPin, PanelLeftClose, PanelLeftOpen, Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Evidence, Subject } from "../types";
import type { Selection } from "../store";
import { formatDateTime } from "../timeUtils";
import { readPersisted, writePersisted } from "./persistence";
import { subjectColorFor } from "./subjectColors";
import { AiSummarySection } from "./AiSummarySection";

interface EvidenceListProps {
  subjects: Subject[];
  /** Already filtered to `subjectFilter`. */
  evidence: Evidence[];
  /** Evidence count before filtering, for the "x of y" label. */
  totalCount: number;
  selection: Selection;
  subjectFilter: string[];
  onToggleSubject: (id: string) => void;
  onClearSubjectFilter: () => void;
  /** Expand the evidence's hour if needed, scroll to it, select it, and flash it — replaces plain selection for list rows. */
  onJumpToEvidence: (id: string) => void;
  onRemoveEvidence: (id: string) => void;
  onManageSubjects: () => void;
}

const EVIDENCE_TYPE_LABEL: Record<Evidence["evidenceType"], string> = {
  witness: "Witness",
  cctv: "CCTV",
  image: "Image",
  video: "Video",
  document: "Document",
  gps: "GPS",
  transaction: "Transaction",
  other: "Other",
};

const COLLAPSE_KEY = "crimepath:sidebarCollapsed";

/** Left-panel subject chips + the full, time-sorted evidence list. Collapses to a thin strip; state persists in localStorage. */
export function EvidenceList({
  subjects,
  evidence,
  totalCount,
  selection,
  subjectFilter,
  onToggleSubject,
  onClearSubjectFilter,
  onJumpToEvidence,
  onRemoveEvidence,
  onManageSubjects,
}: EvidenceListProps) {
  const filtering = subjectFilter.length > 0;
  const countLabel = filtering ? `${evidence.length} of ${totalCount}` : `${evidence.length}`;
  const [collapsed, setCollapsed] = useState(() => readPersisted(COLLAPSE_KEY, false));
  const reduceMotion = useReducedMotion();

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const sorted = [...evidence].sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      writePersisted(COLLAPSE_KEY, next);
      toast(next ? "Evidence list collapsed" : "Evidence list expanded");
      return next;
    });
  }

  return (
    <motion.div
      animate={{ width: collapsed ? 44 : 320 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 35 }}
      className="flex h-full flex-col overflow-hidden"
      style={{ background: "var(--surface)" }}
    >
      {collapsed ? (
        <div className="flex h-full flex-col items-center gap-3 py-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={toggleCollapsed}
            aria-label="Expand evidence list"
            title="Expand evidence list"
            className="rounded p-1.5 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
            style={{ color: "var(--text-muted)" }}
          >
            <PanelLeftOpen size={16} />
          </motion.button>
          <span className="rotate-180 text-[11px] font-medium [writing-mode:vertical-rl]" style={{ color: "var(--text-muted)" }}>
            Evidence ({countLabel})
          </span>
        </div>
      ) : (
        <div className="flex h-full min-w-[320px] flex-col">
          <div className="border-b p-2" style={{ borderColor: "var(--border)" }}>
            <AiSummarySection />
          </div>

          <div className="flex items-center justify-between border-b p-3" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
              Evidence ({countLabel})
            </span>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={toggleCollapsed}
              aria-label="Collapse evidence list"
              title="Collapse evidence list"
              className="rounded p-1 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
              style={{ color: "var(--text-muted)" }}
            >
              <PanelLeftClose size={15} />
            </motion.button>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b p-3" style={{ borderColor: "var(--border)" }}>
            <span className="w-full text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Filter by subject {filtering ? `· ${subjectFilter.length} selected` : "· click to select one or more"}
            </span>
            <button
              type="button"
              onClick={onClearSubjectFilter}
              aria-pressed={!filtering}
              className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
              style={
                !filtering
                  ? { borderColor: "var(--accent)", background: "rgba(61,106,242,0.1)", color: "var(--accent)" }
                  : { borderColor: "var(--border)", color: "var(--text)" }
              }
            >
              All
            </button>
            {subjects.map((s) => {
              const active = subjectFilter.includes(s.id);
              const color = subjectColorFor(subjects, s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => onToggleSubject(s.id)}
                  aria-pressed={active}
                  className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
                  style={
                    active
                      ? { borderColor: "var(--accent)", background: "rgba(61,106,242,0.1)", color: "var(--accent)" } /* UPDATED line 104: rgba was (47,91,234) */
                      : { borderColor: "var(--border)", color: "var(--text)" }
                  }
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color.bg }} />
                  {s.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onManageSubjects}
              title="Add or manage subjects"
              className="flex items-center gap-1.5 rounded-full border border-dashed px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              <Plus size={11} />
              Subject
            </button>
          </div>

          <div className="thin-scrollbar flex-1 overflow-y-auto">
            {sorted.map((e, i) => {
              const subject = subjectById.get(e.subjectId);
              const active = selection?.type === "evidence" && selection.id === e.id;
              const color = subject ? subjectColorFor(subjects, subject.id) : null;
              return (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.15, delay: reduceMotion ? 0 : Math.min(i, 25) * 0.02 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => onJumpToEvidence(e.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") onJumpToEvidence(e.id);
                  }}
                  className="group relative block w-full cursor-pointer border-b px-3 py-2 pr-8 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] hover:bg-[var(--surface-2)]"
                  style={{ borderColor: "var(--border)", background: active ? "rgba(61,106,242,0.08)" : undefined }} /* UPDATED line 133: rgba was (47,91,234) */
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                      {formatDateTime(e.eventTime, true)}
                      {e.attachments && e.attachments.length > 0 && <Paperclip size={10} />}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      {EVIDENCE_TYPE_LABEL[e.evidenceType]}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color?.bg ?? "var(--text-muted)" }} />
                    <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
                      {subject?.name ?? "Unknown"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    {e.event}
                  </p>
                  <p
                    className="mt-0.5 flex items-center gap-1 font-mono text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <MapPin size={9} className="flex-shrink-0" />
                    <span className="truncate">{e.location.name}</span>
                  </p>

                  <button
                    type="button"
                    aria-label="Remove evidence"
                    title="Remove evidence"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (window.confirm("Remove this evidence? This can't be undone.")) {
                        onRemoveEvidence(e.id);
                      }
                    }}
                    className="absolute right-2 top-2 rounded p-1 opacity-0 transition-opacity hover:bg-[var(--surface-2)] group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--conflict-ring)]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Trash2 size={13} />
                  </button>
                </motion.div>
              );
            })}
            {sorted.length === 0 && (
              <p className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                {filtering ? "No evidence for the selected subjects." : "No evidence yet."}
              </p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
