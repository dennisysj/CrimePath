import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import type { CaseAnalysis, Evidence, Subject } from "../types";
import { formatDateTime } from "../timeUtils";
import { getCaseSummary } from "../extractApi";
import { EvidenceLocationsMap } from "./EvidenceLocationsMap";

interface EvidenceInsightsPanelProps {
  caseId: string;
  /** Currently filtered evidence, so the "unverified" list respects active filters like the rest of the dashboard. */
  evidence: Evidence[];
  subjects: Subject[];
  analysis: CaseAnalysis;
  onSelectEvidence: (id: string) => void;
}

function isUnverified(e: Evidence): boolean {
  return e.reliability !== "verified" && e.reliability !== "corroborated";
}

function AiSummarySection({ caseId }: { caseId: string }) {
  const [bullets, setBullets] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setBullets(await getCaseSummary(caseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a summary.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-generate once per time the dashboard is opened for this case;
  // "Regenerate" is the only way to re-spend a Gemini call after that.
  useEffect(() => {
    setBullets(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/70 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-200">
          <Sparkles size={15} className="text-violet-400" />
          AI Summary
        </h3>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 disabled:cursor-not-allowed disabled:text-neutral-600"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {loading ? "Generating…" : "Regenerate"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && bullets && (
        <ul className="space-y-1.5 text-xs text-neutral-300">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-neutral-600">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {!error && !bullets && loading && <p className="text-xs text-neutral-500">Reading the case…</p>}
    </div>
  );
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
  // Conflicts only carry evidence ids, so resolve each back to its subject
  // via the evidence list before tallying (unresolved/genuine ones only).
  const evidenceSubject = new Map(evidence.map((e) => [e.id, e.subjectId]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const counts = new Map<string, number>();
  for (const c of analysis.conflicts) {
    if (c.resolvedByUncertainty) continue;
    for (const id of c.evidenceIds) {
      const subjectId = evidenceSubject.get(id);
      if (subjectId) counts.set(subjectId, (counts.get(subjectId) ?? 0) + 1);
    }
  }
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

export function EvidenceInsightsPanel({ caseId, evidence, subjects, analysis, onSelectEvidence }: EvidenceInsightsPanelProps) {
  return (
    <aside className="thin-scrollbar w-80 flex-shrink-0 space-y-3 overflow-y-auto border-l border-neutral-800 px-4 py-4">
      <AiSummarySection caseId={caseId} />
      <MostConflictingSection evidence={evidence} subjects={subjects} analysis={analysis} />
      <UnverifiedWitnessSection evidence={evidence} subjects={subjects} onSelectEvidence={onSelectEvidence} />
      <EvidenceLocationsMap evidence={evidence} subjects={subjects} onSelectEvidence={onSelectEvidence} />
    </aside>
  );
}
