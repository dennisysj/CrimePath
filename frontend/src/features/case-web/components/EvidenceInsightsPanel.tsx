import { AlertTriangle } from "lucide-react";
import type { CaseAnalysis, Evidence, Subject } from "../types";
import { formatDateTime } from "../timeUtils";
import { countConflictsBySubject } from "../conflictStats";
import { AiSummarySection } from "./AiSummarySection";
import { EvidenceLocationsMap } from "./EvidenceLocationsMap";

interface EvidenceInsightsPanelProps {
  /** Currently filtered evidence, so the "unverified" list respects active filters like the rest of the dashboard. */
  evidence: Evidence[];
  subjects: Subject[];
  analysis: CaseAnalysis;
  onSelectEvidence: (id: string) => void;
}

function isUnverified(e: Evidence): boolean {
  return e.reliability !== "verified" && e.reliability !== "corroborated";
}

function MostConflictingSection({
  evidence,
  subjects,
  analysis,
}: {
  evidence: Evidence[];
  subjects: Subject[];
  analysis: CaseAnalysis;
}) {
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const counts = countConflictsBySubject(analysis.conflicts, evidence);
  const ranked = [...counts.entries()]
    .map(([id, count]) => ({ subject: subjectById.get(id), count }))
    .filter((r): r is { subject: Subject; count: number } => !!r.subject)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const max = ranked[0]?.count ?? 1;

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/70 p-4">
      <h3 className="mb-3 text-sm font-semibold text-neutral-200">People with Most Conflicts</h3>
      {ranked.length === 0 && <p className="text-xs text-neutral-500">No unresolved conflicts right now.</p>}
      <ol className="space-y-2">
        {ranked.map((r, i) => (
          <li key={r.subject.id} className="text-xs">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-neutral-200">
                <span className="font-mono text-neutral-600">{i + 1}</span>
                {r.subject.name}
              </span>
              <span className="text-red-300">
                {r.count} conflict{r.count === 1 ? "" : "s"}
              </span>
            </div>
            <div className="h-1 rounded-full bg-neutral-800">
              <div
                className="h-1 rounded-full bg-red-500/70"
                style={{ width: `${Math.max(8, (r.count / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function UnverifiedWitnessSection({
  evidence,
  subjects,
  onSelectEvidence,
}: {
  evidence: Evidence[];
  subjects: Subject[];
  onSelectEvidence: (id: string) => void;
}) {
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const unverified = evidence
    .filter((e) => e.evidenceType === "witness" && isUnverified(e))
    .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
    .slice(0, 5);

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/70 p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-200">
        <AlertTriangle size={14} className="text-amber-400" />
        Unverified Witness Statements
      </h3>
      {unverified.length === 0 && <p className="text-xs text-neutral-500">Nothing outstanding.</p>}
      <ul className="space-y-2.5">
        {unverified.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onSelectEvidence(e.id)}
              className="w-full text-left text-xs text-neutral-300 hover:text-neutral-100"
            >
              <div className="flex items-center justify-between text-neutral-500">
                <span>{subjectById.get(e.subjectId)?.name ?? e.subjectId}</span>
                <span className="font-mono">{formatDateTime(e.eventTime, true)}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-neutral-300">"{e.event}"</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EvidenceInsightsPanel({ evidence, subjects, analysis, onSelectEvidence }: EvidenceInsightsPanelProps) {
  return (
    <aside className="thin-scrollbar w-80 flex-shrink-0 space-y-3 overflow-y-auto border-l border-neutral-800 px-4 py-4">
      <AiSummarySection />
      <MostConflictingSection evidence={evidence} subjects={subjects} analysis={analysis} />
      <UnverifiedWitnessSection evidence={evidence} subjects={subjects} onSelectEvidence={onSelectEvidence} />
      <EvidenceLocationsMap evidence={evidence} subjects={subjects} onSelectEvidence={onSelectEvidence} />
    </aside>
  );
}
