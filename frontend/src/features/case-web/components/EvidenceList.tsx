import { Paperclip, Trash2 } from "lucide-react";
import type { Evidence, Subject } from "../types";
import type { Selection } from "../store";
import { formatClock } from "../timeUtils";

interface EvidenceListProps {
  subjects: Subject[];
  evidence: Evidence[];
  selection: Selection;
  onSelectSubject: (id: string) => void;
  onSelectEvidence: (id: string) => void;
  onRemoveEvidence: (id: string) => void;
}

const SUBJECT_COLOR: Record<Subject["kind"], string> = {
  person: "#38bdf8",
  phone: "#a78bfa",
  vehicle: "#fbbf24",
  other: "#94a3b8",
};

const EVIDENCE_TYPE_LABEL: Record<Evidence["evidenceType"], string> = {
  witness: "Witness",
  cctv: "CCTV",
  image: "Image", // UPDATED line 22-31: map replaced (was witness/cctv/gps/phone/transaction/transit/police/digital/other)
  video: "Video",
  document: "Document",
  transaction: "Transaction",
  other: "Other",
};

/** Left-panel subject chips (click to highlight a whole thread) + the full, time-sorted evidence list. */
export function EvidenceList({
  subjects,
  evidence,
  selection,
  onSelectSubject,
  onSelectEvidence,
  onRemoveEvidence,
}: EvidenceListProps) {
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const sorted = [...evidence].sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-neutral-800 p-3">
        {subjects.map((s) => {
          const active = selection?.type === "subject" && selection.id === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSelectSubject(s.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors ${
                active
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SUBJECT_COLOR[s.kind] }} />
              {s.name}
            </button>
          );
        })}
      </div>

      <div className="thin-scrollbar flex-1 overflow-y-auto">
        {sorted.map((e) => {
          const subject = subjectById.get(e.subjectId);
          const active = selection?.type === "evidence" && selection.id === e.id;
          return (
            <div
              key={e.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectEvidence(e.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") onSelectEvidence(e.id);
              }}
              className={`group relative block w-full cursor-pointer border-b border-neutral-900 px-3 py-2 pr-8 text-left transition-colors ${
                active ? "bg-emerald-500/10" : "hover:bg-neutral-900"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 font-mono text-xs text-neutral-500">
                  {formatClock(e.eventTime)}
                  {e.attachments && e.attachments.length > 0 && <Paperclip size={10} />}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                  {EVIDENCE_TYPE_LABEL[e.evidenceType]}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: subject ? SUBJECT_COLOR[subject.kind] : SUBJECT_COLOR.other }}
                />
                <span className="text-xs font-medium text-neutral-300">{subject?.name ?? "Unknown"}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{e.event}</p>
              <p className="mt-0.5 font-mono text-[10px] text-neutral-600">{e.location.name}</p>

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
                className="absolute right-2 top-2 rounded p-1 text-neutral-600 opacity-0 transition-opacity hover:bg-neutral-800 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
